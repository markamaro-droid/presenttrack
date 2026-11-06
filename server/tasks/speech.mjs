import { audioChunks } from './audio.mjs';
import { speechMetrics } from './speech-metrics.mjs';

export function speechConfig(env = process.env) {
  return { pauseThresholdSec: Number(env.SPEECH_PAUSE_THRESHOLD_SEC || 2),
    idealWpmMin: Number(env.SPEECH_IDEAL_WPM_MIN || 110), idealWpmMax: Number(env.SPEECH_IDEAL_WPM_MAX || 160),
    weights: { pace: Number(env.SPEECH_WEIGHT_PACE ?? 0.4), pauses: Number(env.SPEECH_WEIGHT_PAUSES ?? 0.3), fillers: Number(env.SPEECH_WEIGHT_FILLERS ?? 0.3) } };
}

// Shared worker/service foundation; callers supply authenticated identity, consent and budget gate.
export async function evaluateSpeech({ prepared, route, userId, consent, needFillers = false, needTiming = true, config = speechConfig() }) {
  // Reject invalid measurement configuration before any paid request.
  speechMetrics({ transcript: '', durationSec: prepared.durationSec }, config);
  const mainText = [], verbatimText = [], words = [], providers = [];
  let fillersAvailable = needFillers, timingAvailable = needTiming;
  for (const chunk of audioChunks(prepared.audio)) {
    const invoke = task => route({ task, input: chunk, userId, consent });
    const main = await invoke('transcription'); mainText.push(main.data.text);
    providers.push({ task: 'transcription', provider: main.provider, model: main.model });
    let timing = main.data.words;
    if (needTiming && !timing?.length) {
      try { const result = await invoke('timing'); timing = result.data.words; providers.push({ task: 'timing', provider: result.provider, model: result.model }); }
      catch { timingAvailable = false; }
    }
    if (needTiming && timing?.length) words.push(...timing.map(w => ({ ...w, start: w.start + chunk.offsetSec, end: w.end + chunk.offsetSec })));
    else timingAvailable = false;
    if (needFillers) {
      try { const result = await invoke('verbatim'); verbatimText.push(result.data.transcript); providers.push({ task: 'verbatim', provider: result.provider, model: result.model }); }
      catch { fillersAvailable = false; }
    }
  }
  const transcript = mainText.join(' '), verbatim = fillersAvailable ? verbatimText.join(' ') : null;
  const metrics = speechMetrics({ transcript, verbatim, words: timingAvailable ? words : null, durationSec: prepared.durationSec }, config);
  return { transcript, verbatim, metrics, providers, trimOffsetSec: prepared.trimOffsetSec,
    timingBasis: timingAvailable ? 'whisper_word_timestamps_not_aligned_to_main_transcript' : 'unavailable' };
}

export async function analyzeSpeech(result, { route, userId, consent }) {
  // Never send word timestamp arrays. Split by text length and merge bounded lists in code.
  const chunks = result.transcript.match(/[\s\S]{1,8000}/g) || [];
  const merged = { redundancies: [], unclearSentences: [], fillerPatterns: [], adjustments: [] }, providers = [];
  for (const transcript of chunks) {
    const response = await route({ task: 'analysis', userId, consent, input: { text: JSON.stringify({ metrics: result.metrics.compact, transcript }) } });
    providers.push({ provider: response.provider, model: response.model });
    for (const key of Object.keys(merged)) {
      const seen = new Set(merged[key].map(value => JSON.stringify(value)));
      for (const value of response.data[key]) if (merged[key].length < 3 && !seen.has(JSON.stringify(value))) { merged[key].push(value); seen.add(JSON.stringify(value)); }
    }
  }
  if (!result.metrics.compact.fillersAvailable) merged.fillerPatterns = [];
  return { data: merged, providers };
}
