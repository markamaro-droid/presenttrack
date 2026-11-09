import { createHash } from 'node:crypto';
import { createSpeechCache, validAudio } from './speech-cache.mjs';
import { ChatError, createAccess } from './ai-access.mjs';

// Bounded, per-user warm-instance cache. Never log text, credentials or audio.
export function createSpeechService({ env = process.env, fetchImpl = fetch, access = createAccess({ env, fetchImpl, requiredKey: 'CARTESIA_API_KEY' }), storage = createSpeechCache({ env, fetchImpl }) } = {}) {
  const cache = new Map();
  const pending = new Map();
  let bytes = 0;
  return async (authorization, body) => {
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000 || !['en', 'tl'].includes(body.language)) {
      throw new ChatError(400, 'invalid_speech', 'Send up to 1,000 characters and a supported language.');
    }
    const identity = await access.authenticate(authorization);
    if (!env.CARTESIA_VOICE_ID?.trim()) throw new ChatError(503, 'setup_required', 'Tracy needs a Cartesia voice ID.');
    const payload = { model_id: env.CARTESIA_MODEL?.trim() || 'sonic-3.6-2026-08-27', transcript: body.text.trim(),
      voice: env.CARTESIA_VOICE_ID.trim(), language: body.language,
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 16000 } };
    // Emotion guidance is English-only. Other replies keep the model's
    // context-sensitive delivery, rather than forcing cheerful feedback.
    if (body.language === 'en' && /^sonic-3/.test(payload.model_id)
        && /^Hi there! I'm Tracy, your presentation coach\./.test(payload.transcript)) {
      payload.generation_config = { emotion: 'happy' };
    }
    const key = createHash('sha256').update(identity.userId + 'speech-v1:2026-08-14:' + JSON.stringify(payload)).digest('hex');
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (pending.has(key)) return pending.get(key);
    const generate = async () => {
      let audio = await storage.read(identity, key);
      let persisted = true;
      if (!audio) {
        const quota = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/take_tracy_speech_slot`, {
          method: 'POST', headers: { ...identity.headers, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000)
        });
        if (!quota.ok) throw new ChatError(503, 'speech_setup', 'Voice usage checks are unavailable. Run the Tracy speech migration.');
        const slot = await quota.json();
        if (slot.allowed !== true) throw new ChatError(429, 'speech_limit', 'Tracy’s voice limit was reached. You can still read the captions.', 60);
        const response = await fetchImpl('https://api.cartesia.ai/tts/bytes', {
          method: 'POST', headers: { Authorization: `Bearer ${env.CARTESIA_API_KEY.trim()}`, 'Cartesia-Version': '2026-08-14', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(25000)
        });
        if (!response.ok) throw new ChatError(503, 'speech_unavailable', 'Tracy’s voice is unavailable. You can still read the captions.');
        audio = Buffer.from(await response.arrayBuffer());
        if (!validAudio(audio)) throw new ChatError(502, 'invalid_audio', 'Tracy could not play this reply.');
        // Deliver already-paid audio even if storage becomes unavailable mid-request.
        // Keep it in warm memory so an immediate retry doesn't synthesize again.
        persisted = await storage.write(identity, key, audio).catch(() => false);
      }
      const result = { cachedPermanently: persisted, audio: audio.toString('base64'), mime: 'audio/wav', provider: 'cartesia' };
      if (cached) { bytes -= cached.size; cache.delete(key); }
      while (cache.size && (bytes + audio.length > 16000000 || cache.size >= 40)) {
        const first = cache.keys().next().value; bytes -= cache.get(first).size; cache.delete(first);
      }
      cache.set(key, { result, size: audio.length, expires: Date.now() + 3600000 }); bytes += audio.length;
      return result;
    };
    const task = generate(); pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
