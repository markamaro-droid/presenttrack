import { ChatError } from './ai-access.mjs';

export const validAudio = audio => audio.length > 0 && audio.length <= 2800000 && audio.toString('ascii', 0, 4) === 'RIFF';
export function createSpeechCache({ env, fetchImpl }) {
  const base = `${env.SUPABASE_URL?.replace(/\/$/, '')}/storage/v1/object`;
  const path = (identity, hash) => `tracy-speech-cache/${encodeURIComponent(identity.userId)}/${hash}.wav`;
  return {
    async read(identity, hash) {
      const response = await fetchImpl(`${base}/authenticated/${path(identity, hash)}`, {
        headers: identity.headers, signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const audio = Buffer.from(await response.arrayBuffer());
        if (validAudio(audio)) return audio;
        throw new ChatError(503, 'speech_cache_invalid', 'A saved voice clip is damaged. Please contact the site owner.');
      }
      const error = await response.json().catch(() => ({}));
      // Supabase may use HTTP 400 for a missing object. A missing bucket or
      // permissions failure must not trigger fresh paid synthesis on every retry.
      if (['NoSuchKey', 'ObjectNotFound'].includes(error.code) || error.message === 'Object not found' || error.error === 'Object not found') return null;
      throw new ChatError(503, 'speech_cache_unavailable', 'Voice storage is unavailable. Please check the Tracy cache migration.');
    },
    async write(identity, hash, audio) {
      const response = await fetchImpl(`${base}/${path(identity, hash)}`, {
        method: 'POST', headers: { ...identity.headers, 'Content-Type': 'audio/wav', 'x-upsert': 'false', 'cache-control': '3600' },
        body: audio, signal: AbortSignal.timeout(8000)
      });
      if (response.ok) return true;
      const error = await response.json().catch(() => ({}));
      return response.status === 409 || error.code === 'Duplicate' || error.error === 'Duplicate';
    }
  };
}
