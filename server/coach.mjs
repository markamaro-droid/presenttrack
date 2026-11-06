import { ChatError, createAccess } from './ai-access.mjs';
import { SYSTEM_PROMPT, validateBody, LIMITS } from './chat.mjs';

export function createCoachService({ env = process.env, fetchImpl = fetch } = {}) {
  const access = createAccess({ env, fetchImpl, requiredKey: 'GROQ_API_KEY' });
  return async (authorization, body) => {
    const starting = body?.action === 'start' && Object.keys(body).length === 1;
    const messages = starting ? null : validateBody(body);
    const identity = await access.authenticate(authorization);
    await access.quota(identity, starting ? 'voice' : 'chat');
    if (starting) return { ready: true };
    const response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.GROQ_MODEL || 'openai/gpt-oss-20b', max_completion_tokens: 600,
        messages: [{ role: 'system', content: SYSTEM_PROMPT + '\nThis is turn-based browser speech. Answer in 1–3 short sentences suitable for speaking aloud. Match English, Filipino or Taglish. No markdown. Browser speech recognition and synthesis are required; WebRTC is not used in this mode.' }, ...messages] })
    });
    if (!response.ok) {
      if (response.status === 429) {
        const seconds = Math.max(1, Math.min(86400, Number(response.headers.get('retry-after')) || 60));
        throw new ChatError(503, 'groq_limit', 'Tracy has reached the Groq service limit. Please try again later.', seconds);
      }
      if ([401, 403].includes(response.status)) throw new ChatError(503, 'provider_access', 'Tracy’s Groq key needs attention from the site owner.');
      if ([400, 404].includes(response.status)) throw new ChatError(503, 'provider_configuration', 'Tracy’s Groq model needs attention from the site owner.');
      throw new ChatError(503, 'provider_busy', 'Tracy’s AI service is unavailable. Please try again shortly.');
    }
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) throw new ChatError(502, 'provider_failed', 'Tracy could not generate a reply. Please retry.');
    return { reply: reply.trim().slice(0, LIMITS.reply) };
  };
}
