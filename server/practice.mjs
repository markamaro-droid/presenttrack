import { createAccess, ChatError } from './ai-access.mjs';
import { computeMetrics } from '../supabase/functions/_shared/metrics.js';
import { classify } from '../supabase/functions/_shared/classify.js';
import { ruleBasedFeedback } from '../supabase/functions/_shared/feedback.js';
import { assessQuality } from '../supabase/functions/_shared/quality.js';
import { CRITERIA } from '../supabase/functions/_shared/criteria.js';

export function createPracticeService({ env = process.env, fetchImpl = fetch, access = createAccess({ env, fetchImpl, requiredKey: 'GROQ_API_KEY' }) } = {}) {
  return async (authorization, input) => {
    const identity = await access.authenticate(authorization);
    if (input?.consent !== true || typeof input.audio !== 'string' || input.audio.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio)
      || !['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'].includes(input.mime)
      || !Number.isFinite(input.target) || input.target < 60 || input.target > 14400) throw new ChatError(400, 'invalid_recording', 'Choose a supported recording under 3 MB and a valid target time.');
    const audio = Buffer.from(input.audio, 'base64');
    if (!audio.length || audio.length > 3000000) throw new ChatError(413, 'too_large', 'Use a recording under 3 MB.');
    await access.quota(identity, 'voice');
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
  };
}
