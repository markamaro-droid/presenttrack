import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { ChatError, createAccess, providerError } from './ai-access.mjs';
import { SYSTEM_PROMPT } from './chat.mjs';

export const VOICES = ['marin', 'cedar', 'coral'];
export const VOICE_LIMITS = Object.freeze({ sdp: 24000, durationSeconds: 600, maxOutputTokens: 600, contextTokens: 6000 });
export const VOICE_PROMPT = `${SYSTEM_PROMPT}
You are Tracy, PresentTrack's AI voice presentation coach. Introduce yourself as Tracy when asked your name.
Speak naturally and warmly with conversational pacing, clear pronunciation and pauses. Keep most answers to two or three short sentences, then let the student respond. Ask a relevant follow-up question when helpful.
Match the student's English, Filipino or Taglish; if unsure what they said, ask them to repeat. Do not pretend to be a human. Your voice is synthetic, not an imitation of a real person.
This is an active voice conversation, not a text chat. You have no tools and cannot change or navigate the application. Explain which controls to use instead. You never receive saved student records. Do not fabricate actions, scores or personal facts.`;

function sessionConfig(env, voice) {
  return {
    type: 'realtime', model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions: VOICE_PROMPT, output_modalities: ['audio'], max_output_tokens: VOICE_LIMITS.maxOutputTokens,
    audio: {
      input: {
        noise_reduction: { type: 'near_field' },
        transcription: { model: env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe' },
        turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 650, create_response: true, interrupt_response: true }
      },
      output: { voice, speed: 1.0 }
    },
    truncation: { type: 'retention_ratio', retention_ratio: 0.8, token_limits: { post_instructions: VOICE_LIMITS.contextTokens } },
    tools: [], tracing: null
  };
}
function sign(payload, key) { return createHmac('sha256', key).update('tracy-call-v1:' + payload).digest('base64url'); }
function makeTicket(call, user, key) {
  const payload = Buffer.from(JSON.stringify({ call, user, expires: Date.now() + 65 * 60000 })).toString('base64url');
  return payload + '.' + sign(payload, key);
}
function readTicket(ticket, user, key) {
  if (typeof ticket !== 'string' || ticket.length > 1500) throw new ChatError(400, 'invalid_session', 'This voice session could not be ended remotely.');
  const [payload, mac, extra] = ticket.split('.');
  const expected = sign(payload || '', key);
  if (extra || !mac || !/^[A-Za-z0-9_-]{43}$/.test(mac) || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new ChatError(403, 'invalid_session', 'This voice session does not belong to you.');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new ChatError(400, 'invalid_session', 'Invalid voice session.'); }
  if (data.user !== user || data.expires < Date.now() || !/^[\w-]{1,200}$/.test(data.call)) throw new ChatError(403, 'invalid_session', 'This voice session does not belong to you.');
  return data.call;
}
export function createVoiceService({ env = process.env, fetchImpl = fetch } = {}) {
  const access = createAccess({ env, fetchImpl });
  return async (authorization, body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ChatError(400, 'invalid_request', 'Please restart the voice connection.');
    if (body.action === 'end') {
      if (Object.keys(body).some(k => !['action', 'ticket'].includes(k))) throw new ChatError(400, 'invalid_request', 'Invalid voice request.');
      const identity = await access.authenticate(authorization);
      const call = readTicket(body.ticket, identity.userId, env.OPENAI_API_KEY);
      const response = await fetchImpl(`https://api.openai.com/v1/realtime/calls/${call}/hangup`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(5000)
      });
      if (!response.ok && ![404, 410].includes(response.status)) throw await providerError(response);
      return { ended: true };
    }
    if (Object.keys(body).some(k => !['sdp', 'voice'].includes(k)) || typeof body.sdp !== 'string' ||
        body.sdp.length > VOICE_LIMITS.sdp || !body.sdp.startsWith('v=0') || !/(?:\r?\n)m=audio /.test(body.sdp) || /(?:\r?\n)m=video /.test(body.sdp)) {
      throw new ChatError(400, 'invalid_offer', 'Please restart Tracy’s voice connection.');
    }
    const voice = body.voice || 'marin';
    if (!VOICES.includes(voice)) throw new ChatError(400, 'invalid_voice', 'Please select one of Tracy’s available voices.');
    const identity = await access.authenticate(authorization);
    await access.quota(identity, 'voice');
    const form = new FormData();
    form.set('sdp', body.sdp); form.set('session', JSON.stringify(sessionConfig(env, voice)));
    const response = await fetchImpl('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': createHash('sha256').update(identity.userId).digest('hex') },
      body: form, signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw await providerError(response);
    const sdp = await response.text();
    if (!sdp.startsWith('v=0') || sdp.length > VOICE_LIMITS.sdp) throw new ChatError(502, 'invalid_answer', 'Tracy’s voice connection failed. Please try again.');
    const location = response.headers.get('Location');
    const call = location?.match(/\/realtime\/calls\/([\w-]+)$/)?.[1];
    return { sdp, ticket: call ? makeTicket(call, identity.userId, env.OPENAI_API_KEY) : null, durationSeconds: VOICE_LIMITS.durationSeconds };
  };
}
