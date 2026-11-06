import { ChatError, createAccess } from './ai-access.mjs';
import { SYSTEM_PROMPT, validateBody, LIMITS } from './chat.mjs';

export function createCoachService({ env = process.env, fetchImpl = fetch } = {}) {
  const providers = [env.GROQ_API_KEY?.trim() && 'groq', env.GEMINI_API_KEY?.trim() && 'gemini'].filter(Boolean);
  const access = createAccess({ env, fetchImpl, requiredKey: providers[0] === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY' });
  return async (authorization, body) => {
    const starting = body?.action === 'start' && Object.keys(body).length === 1;
    const messages = starting ? null : validateBody(body);
    const identity = await access.authenticate(authorization);
    await access.quota(identity, starting ? 'voice' : 'chat');
    if (starting) return { ready: true };
    const instruction = SYSTEM_PROMPT + '\nThis is turn-based browser speech. Answer in 1–3 short sentences suitable for speaking aloud. Match English, Filipino or Taglish. No markdown. Browser speech recognition and synthesis are required; WebRTC is not used in this mode.';
    let lastError;
    for (const provider of providers) {
      let response, data;
      try {
        const gemini = provider === 'gemini';
        response = await fetchImpl(gemini
          ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || 'gemini-3.5-flash-lite')}:generateContent`
          : 'https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.timeout(12000),
          headers: gemini ? { 'x-goog-api-key': env.GEMINI_API_KEY.trim(), 'Content-Type': 'application/json' }
            : { Authorization: `Bearer ${env.GROQ_API_KEY.trim()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(gemini ? {
            systemInstruction: { parts: [{ text: instruction }] },
            contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
            generationConfig: { maxOutputTokens: 600 }
          } : { model: env.GROQ_MODEL || 'openai/gpt-oss-20b', max_completion_tokens: 600,
            messages: [{ role: 'system', content: instruction }, ...messages] })
        });
        if (response.ok) data = await response.json();
      } catch {
        lastError = new ChatError(503, 'provider_busy', 'Tracy’s AI services could not be reached. Please try again shortly.');
        continue;
      }
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Math.max(1, Math.min(86400, Number(response.headers.get('retry-after')) || 60));
          lastError = new ChatError(503, providers.length === 1 && provider === 'groq' ? 'groq_limit' : 'provider_limit', 'Tracy’s available AI services have reached a limit. Please try again later.', seconds);
        } else if ([401, 403].includes(response.status)) {
          lastError = new ChatError(503, 'provider_access', 'Tracy’s AI provider access needs attention from the site owner.');
        } else if ([400, 404].includes(response.status)) {
          lastError = new ChatError(503, 'provider_configuration', 'Tracy’s AI model configuration needs attention from the site owner.');
        } else {
          lastError = new ChatError(503, 'provider_busy', 'Tracy’s AI service is unavailable. Please try again shortly.');
        }
        // One attempt per configured provider. Never bypass validation or quota failures.
        if ([401, 403, 404, 429].includes(response.status) || response.status >= 500) continue;
        throw lastError;
      }
      // Do not retry refusals/blocked or empty successful responses with another provider.
      if (provider === 'gemini' && (data?.promptFeedback?.blockReason || ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION'].includes(data?.candidates?.[0]?.finishReason))) {
        throw new ChatError(422, 'provider_blocked', 'Tracy could not answer that request. Try rephrasing your presentation question.');
      }
      const reply = provider === 'gemini' ? data?.candidates?.[0]?.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('') : data?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) throw new ChatError(502, 'provider_failed', 'Tracy could not generate a reply. Please retry.');
      return { reply: reply.trim().slice(0, LIMITS.reply) };
    }
    throw lastError;
  };
}
