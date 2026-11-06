export const tokenize = text => String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || [];
export function speechMetrics({ transcript, words = null, verbatim = null, durationSec }, config = {}) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('invalid_duration');
  const threshold = config.pauseThresholdSec ?? 2;
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('invalid_pause_threshold');
  const tokens = tokenize(transcript), vt = verbatim === null ? null : tokenize(verbatim);
  const timingAvailable = Array.isArray(words) && words.length > 0 && words.every(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.start >= 0 && w.end >= w.start && w.end <= durationSec + 0.1);
  const sorted = timingAvailable ? [...words].sort((a, b) => a.start - b.start) : [];
  const pauses = []; let end = sorted[0]?.end || 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start - end;
    if (gap > threshold) pauses.push({ start: end, duration: gap });
    end = Math.max(end, sorted[i].end); // Overlaps must not create false gaps.
  }
  const definite = new Set(['um', 'uh', 'umm', 'uhh', 'erm', 'er']);
  const ambiguous = new Set(['parang', 'ano', 'like']);
  const fillers = vt === null ? null : vt.filter(w => definite.has(w)).length;
  const possibleFillers = vt === null ? null : vt.filter(w => ambiguous.has(w)).length;
  const repetitionTokens = vt || tokens;
  const repetitions = repetitionTokens.reduce((sum, word, i) => sum + Number(i > 0 && word === repetitionTokens[i - 1]), 0);
  const compact = { wordCount: tokens.length, durationSec, wpm: Math.round(tokens.length * 600 / durationSec) / 10,
    timingAvailable, pauseCount: timingAvailable ? pauses.length : null, pauseSeconds: timingAvailable ? pauses.reduce((sum, p) => sum + p.duration, 0) : null,
    fillersAvailable: vt !== null, fillerCount: fillers, possibleFillerCount: possibleFillers, repetitionCount: repetitions,
    repetitionSource: vt === null ? 'main_transcript' : 'verbatim' };
  return { compact, pauses, score: scoreSpeech(compact, config) };
}
export function scoreSpeech(metrics, config = {}) {
  const weights = config.weights || { pace: 0.4, pauses: 0.3, fillers: 0.3 };
  const values = [weights.pace, weights.pauses, weights.fillers];
  if (values.some(n => !Number.isFinite(n) || n < 0) || values.reduce((a, b) => a + b, 0) <= 0) throw new Error('invalid_weights');
  // Missing measurements are not a zero-penalty/perfect score.
  if (!metrics.timingAvailable || !metrics.fillersAvailable || !metrics.wordCount) return { value: null, reason: 'insufficient_measurements' };
  const low = config.idealWpmMin ?? 110, high = config.idealWpmMax ?? 160;
  if (!(low > 0 && high >= low)) throw new Error('invalid_pace_range');
  const distance = metrics.wpm < low ? low - metrics.wpm : Math.max(0, metrics.wpm - high);
  const dimensions = { pace: Math.max(0, 100 - distance * 2), pauses: Math.max(0, 100 - metrics.pauseSeconds / metrics.durationSec * 200), fillers: Math.max(0, 100 - metrics.fillerCount / metrics.wordCount * 500) };
  const total = values.reduce((a, b) => a + b, 0);
  return { value: Math.round(Object.keys(dimensions).reduce((sum, key) => sum + dimensions[key] * weights[key], 0) / total), dimensions, version: 'speech-score-v1' };
}
export function wordErrorRate(reference, hypothesis) {
  const a = tokenize(reference), b = tokenize(hypothesis);
  if (!a.length) return b.length ? null : 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length] / a.length;
}
