import { createAccess, ChatError } from './ai-access.mjs';
import { computeMetrics } from '../supabase/functions/_shared/metrics.js';
import { classify } from '../supabase/functions/_shared/classify.js';
import { ruleBasedFeedback } from '../supabase/functions/_shared/feedback.js';
import { assessQuality } from '../supabase/functions/_shared/quality.js';
import { CRITERIA } from '../supabase/functions/_shared/criteria.js';

export function createPracticeService({ env = process.env, fetchImpl = fetch, access = createAccess({ env, fetchImpl, requiredKey: 'GROQ_API_KEY' }) } = {}) {
  return async (authorization, input) => {
    const identity = await access.authenticate(authorization);
    const stored = typeof input?.storagePath === 'string';
    const validSource = stored
      ? input.audio === undefined && input.storagePath.startsWith(identity.userId + '/') && /^[0-9a-f-]+\/[0-9a-f-]+$/.test(input.storagePath)
      : typeof input?.audio === 'string' && input.audio.length <= 4000000 && /^[A-Za-z0-9+/]+={0,2}$/.test(input.audio);
    if (input?.consent !== true || !validSource
      || !['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'].includes(input.mime)
      || !Number.isFinite(input.target) || input.target < 60 || input.target > 14400) throw new ChatError(400, 'invalid_recording', 'Choose a supported recording and a valid target time.');
    const storageUrl = stored ? `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/practice-audio-temp/${input.storagePath}` : null;
    try {
    await access.quota(identity, 'voice');
    let audio;
    if (stored) {
      const download = await fetchImpl(storageUrl, { headers: identity.headers, signal: AbortSignal.timeout(30000) });
      if (!download.ok) throw new ChatError(400, 'upload_unavailable', 'Temporary recording unavailable. Please upload it again.');
      if (Number(download.headers.get('content-length')) > 25000000) { await download.body?.cancel(); throw new ChatError(413, 'too_large', 'Use a recording up to 25 MB.'); }
      const chunks = []; let size = 0;
      for await (const chunk of download.body) {
        size += chunk.length;
        if (size > 25000000) throw new ChatError(413, 'too_large', 'Use a recording up to 25 MB.');
        chunks.push(Buffer.from(chunk));
      }
      audio = Buffer.concat(chunks);
    } else audio = Buffer.from(input.audio, 'base64');
    if (!audio.length || audio.length > (stored ? 25000000 : 3000000)) throw new ChatError(413, 'too_large', 'Recording exceeds the upload limit.');
    const form = new FormData();
    const ext = { 'audio/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm' }[input.mime];
    form.set('file', new Blob([audio], { type: input.mime }), 'practice.' + ext);
    form.set('model', env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3');
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word'); form.append('timestamp_granularities[]', 'segment');
    const response = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new ChatError(503, 'transcription_failed', 'Recording analysis is unavailable or its usage limit was reached. Retry later; no report was generated.');
    const data = await response.json();
    if (!Number.isFinite(data.duration) || data.duration < 20 || data.duration > 600 || !Array.isArray(data.words) || !data.words.length || data.words.length > 10000
      || data.words.some(w => typeof w.word !== 'string' || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start || w.end > data.duration + 1)) throw new ChatError(422, 'unusable_recording', 'Use a clear recording between 20 seconds and 10 minutes with audible speech.');
    const metrics = computeMetrics({ words: data.words, totalDurationSec: data.duration });
    metrics.wpm = metrics.overallWpm;
    const quality = assessQuality(metrics, Array.isArray(data.segments) ? data.segments : []);
    if (quality.level === 'unusable') throw new ChatError(422, 'unusable_recording', 'Not enough clear speech was detected. Try recording again in a quiet place.');
    const criteria = { ...CRITERIA, duration: { ...CRITERIA.duration, targetMinSec: input.target * .9, targetMaxSec: input.target * 1.1, acceptableMinSec: input.target * .75, acceptableMaxSec: input.target * 1.25 } };
    const result = classify(metrics, quality, criteria);
    const feedback = ruleBasedFeedback(metrics, result);
    // Shared baseline feedback assumes a 2–3 minute task; use the selected practice target instead.
    for (const key of ['strengths','improvements','recommendations']) feedback[key] = feedback[key].map(t => t.replace(/2-3 minute/g, `${Math.round(input.target / 60)} minute`));
    return { ...result, metrics, quality, feedback, criteria, provider: 'groq', source: 'recorded-audio', transcript: String(data.text || '').slice(0, 20000) };
    } finally {
      if (stored) {
        try {
          const removed = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/practice-audio-temp`, {
            method: 'DELETE', headers: { ...identity.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: [input.storagePath] }), signal: AbortSignal.timeout(8000)
          });
          if (!removed.ok) console.warn('Temporary practice audio cleanup failed.');
        } catch { console.warn('Temporary practice audio cleanup unavailable.'); }
      }
    }
  };
}
