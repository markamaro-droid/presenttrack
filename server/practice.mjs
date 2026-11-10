import { createAccess, ChatError } from './ai-access.mjs';
import { computeMetrics } from '../supabase/functions/_shared/metrics.js';
import { classify } from '../supabase/functions/_shared/classify.js';
import { ruleBasedFeedback } from '../supabase/functions/_shared/feedback.js';
import { assessQuality } from '../supabase/functions/_shared/quality.js';
import { CRITERIA } from '../supabase/functions/_shared/criteria.js';
import { presentationFeedback } from './presentation-feedback.mjs';
import { validateContent, contentMessage } from './content-validation.mjs';
import { transcribeVerbatim } from './verbatim.mjs';
import '../assets/evaluation/study-habits.js';
const EVALUATION_DECK = globalThis.PT_EVALUATION_DECK;

export function createPracticeService({ env = process.env, fetchImpl = fetch, access = createAccess({ env, fetchImpl, requiredKey: 'GROQ_API_KEY' }) } = {}) {
  return async (authorization, input) => {
    const identity = await access.authenticate(authorization);
    if (input?.purpose !== undefined && input.purpose !== 'evaluation') throw new ChatError(400, 'invalid_purpose', 'Invalid recording purpose.');
    const evaluation = input?.purpose === 'evaluation';
    if (evaluation && !env.GEMINI_API_KEY?.trim()) throw new ChatError(503, 'setup_required', 'Recorded evaluation needs a Gemini API key for the verbatim filler check. Ask the site owner to configure it; no score was awarded.');
    const context=input?.presentation;
    if(context!==undefined&&(!context||typeof context.title!=='string'||context.title.length>160||typeof context.text!=='string'||context.text.length>20000))throw new ChatError(400,'invalid_presentation','Presentation text exceeds the context limit.');
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
    form.set('temperature', '0');
    form.set('prompt', 'Verbatim speech with audible hesitations, filler sounds, repetitions and false starts preserved. Do not clean up speech or add words that were not heard.');
    form.append('timestamp_granularities[]', 'word'); form.append('timestamp_granularities[]', 'segment');
    const response = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new ChatError(503, 'transcription_failed', 'Recording analysis is unavailable or its usage limit was reached. Retry later; no report was generated.');
    const data = await response.json();
    if (!Number.isFinite(data.duration) || data.duration < 20 || data.duration > 600 || !Array.isArray(data.words) || !data.words.length || data.words.length > 10000
      || data.words.some(w => typeof w.word !== 'string' || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start || w.end > data.duration + 1)) throw new ChatError(422, 'unusable_recording', 'Use a clear recording between 20 seconds and 10 minutes with audible speech.');
    const transcript = data.words.map(w => w.word).join(' ').trim().slice(0,20000);
    const reference = evaluation ? EVALUATION_DECK.slides.flatMap(s => s.bullets).join(' ') : context?.text || '';
    const contentValidation = validateContent(transcript, { reference, durationSec: data.duration, evaluation,
      sections: evaluation ? EVALUATION_DECK.slides.map(s => s.bullets.join(' ')) : [] });
    if (!contentValidation.eligible) throw new ChatError(422, 'invalid_presentation_speech', contentMessage(contentValidation.reason));
    let verbatim = null, verbatimFailed = false;
    try { verbatim = await transcribeVerbatim({ env, fetchImpl, audio, mime: input.mime, transcript }); } catch { verbatimFailed = true; }
    if (evaluation && !verbatim) throw new ChatError(503, 'filler_check_unavailable', 'The verbatim filler check could not finish. No baseline was awarded. Retry analysis to use the same recording.');
    if (evaluation) {
      const checked = validateContent(verbatim, { reference, durationSec: data.duration, evaluation: true, sections: EVALUATION_DECK.slides.map(s => s.bullets.join(' ')) });
      if (!checked.eligible) throw new ChatError(422, 'invalid_presentation_speech', contentMessage(checked.reason));
    }
    const metrics = computeMetrics({ words: data.words, totalDurationSec: data.duration, ...(verbatim ? { fillerTranscript: verbatim } : {}) });
    metrics.wpm = metrics.overallWpm;
    metrics.paceBasis = 'recognized-words-over-audio-duration';
    metrics.pauseBasis = 'audio-word-timestamps';
    metrics.fillerBasis = verbatim ? 'verbatim-audio-transcript' : 'audio-word-transcript';
    const quality = assessQuality(metrics, Array.isArray(data.segments) ? data.segments : []);
    if (quality.level === 'unusable') throw new ChatError(422, 'unusable_recording', 'Not enough clear speech was detected. Try recording again in a quiet place.');
    quality.warnings.push(verbatim ? 'Fillers are estimated from a separate verbatim audio transcription. Their exact timeline positions are unavailable.' : 'Filler counts are a lower-bound estimate from the audio transcript; speech recognition can omit hesitations. Zero detected does not prove there were none.');
    if (verbatimFailed) quality.warnings.push('The additional verbatim speech check was unavailable. No extra filler events were invented.');
    const criteria = evaluation ? CRITERIA : { ...CRITERIA, duration: { ...CRITERIA.duration, targetMinSec: input.target * .9, targetMaxSec: input.target * 1.1, acceptableMinSec: input.target * .75, acceptableMaxSec: input.target * 1.25 } };
    const result = classify(metrics, quality, criteria);
    const feedback = ruleBasedFeedback(metrics, result);
    // Shared baseline feedback assumes a 2–3 minute task; use the selected practice target instead.
    if (!evaluation) for (const key of ['strengths','improvements','recommendations']) feedback[key] = feedback[key].map(t => t.replace(/2-3 minute/g, `${Math.round(input.target / 60)} minute`));
    if (evaluation) return { ...result, version: 3, source: 'recorded-evaluation', provider: 'groq', metrics, quality, feedback, criteria, contentValidation,
      topic: EVALUATION_DECK.title, deckId: EVALUATION_DECK.id, deckVersion: EVALUATION_DECK.version,
      transcript, ...(verbatim ? { verbatimTranscript: verbatim } : {}), created_at: new Date().toISOString() };
    let comments=null,contextStatus=context?.text.trim()?'unavailable':'not-provided';
    if(context?.text.trim()) {
      try {
        await access.quota(identity,'chat');
        comments=await presentationFeedback({env,fetchImpl,context,transcript,metrics,feedback});
        contextStatus='reviewed';
      } catch { /* Preserve measured results when AI feedback is unavailable. */ }
    }
    return { ...result, metrics, quality, feedback, comments, contextStatus, contentValidation, criteria, provider: 'groq', source: 'recorded-audio', transcript };
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
