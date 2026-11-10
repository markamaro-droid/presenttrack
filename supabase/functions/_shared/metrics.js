// Speech metrics from word-level timestamps. Pure functions, no I/O.
//
// DEFINITIONS (also in supabase/README.md):
//  * Tokens: every recognized word token (lowercased, punctuation stripped). Filler tokens
//    (um, uh, ...) ARE counted in `words`, because they are real speech sounds.
//  * speakingDurationSec = (last word end - first word start) - sum of gaps >= LONG_PAUSE (2.0 s).
//    Short natural pauses (< 2 s) count as speaking time. Leading/trailing silence is excluded.
//  * wpm = words / (speakingDurationSec / 60).
//  * overallWpm = words / (totalDurationSec / 60), i.e. over the whole recording.
//  * Rates per minute (fillers, long pauses) use spanSec = last end - first start.
//  * "like" is a filler only by heuristic (not after pronouns/verbs, not before "to"), so
//    those counts are POSSIBLE fillers. "you know" is skipped after do/did/if/as.
import { CRITERIA } from './criteria.js';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

export function normalizeToken(w) {
  return String(w == null ? '' : w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '').replace(/^'+|'+$/g, '');
}

export function computeMetrics(input = {}, criteria = CRITERIA) {
  const longPause = criteria.pauses.longPauseSec;
  const raw = Array.isArray(input && input.words) ? input.words : [];
  const words = raw
    .map((w) => ({ word: normalizeToken(w && w.word), start: Number(w && w.start), end: Number(w && w.end) }))
    .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ ...w, end: Math.max(w.end, w.start) }))
    .sort((a, b) => a.start - b.start);

  const lastEnd = words.length ? Math.max(...words.map((w) => w.end)) : 0;
  const given = Number(input && input.totalDurationSec);
  const totalDurationSec = Number.isFinite(given) && given > 0 ? given : lastEnd;

  // Pauses
  const pauses = [];
  let previousEnd = words[0]?.end || 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - previousEnd;
    if (gap >= longPause) pauses.push({ t: r2(previousEnd), dur: r2(gap) });
    previousEnd = Math.max(previousEnd, words[i].end);
  }
  const pauseTotal = pauses.reduce((s, p) => s + p.dur, 0);
  const longestPause = pauses.reduce((m, p) => Math.max(m, p.dur), 0);

  const spanSec = words.length ? Math.max(0, lastEnd - words[0].start) : 0;
  const speakingDurationSec = Math.max(0, spanSec - pauseTotal);

  // Fillers
  const single = new Set(criteria.fillers.single);
  const likeBlockPrev = new Set(criteria.fillers.likeBlockedPrev);
  const likeBlockNext = new Set(criteria.fillers.likeBlockedNext);
  const ykBlockPrev = new Set(criteria.fillers.youKnowBlockedPrev);
  const fillers = [];
  const fillerWords = typeof input.fillerTranscript === 'string'
    ? (input.fillerTranscript.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || []).map(word => ({ word: normalizeToken(word), start: null })) : words;
  const at = i => fillerWords[i].start === null ? null : r2(fillerWords[i].start);
  for (let i = 0; i < fillerWords.length; i++) {
    const w = fillerWords[i].word;
    const prev = i > 0 ? fillerWords[i - 1].word : null;
    const next = i + 1 < fillerWords.length ? fillerWords[i + 1].word : null;
    if (single.has(w) || /^(?:u+m+|u+h+m*|e+r+m*)$/.test(w)) {
      fillers.push({ word: w, t: at(i) });
    } else if (w === 'you' && next === 'know' && !(prev && ykBlockPrev.has(prev))) {
      fillers.push({ word: 'you know', t: at(i) });
      i++; // consume "know"
    } else if (criteria.fillers.ambiguous.includes(w)) {
      if (!(prev && likeBlockPrev.has(prev)) && !(next && likeBlockNext.has(next))) {
        fillers.push({ word: w, t: at(i), heuristic: true });
      }
    }
  }
  const fillerByWord = {};
  fillers.forEach((f) => { fillerByWord[f.word] = (fillerByWord[f.word] || 0) + 1; });

  const spanMin = spanSec / 60;
  const wpm = speakingDurationSec > 0 ? words.length / (speakingDurationSec / 60) : 0;
  const overallWpm = totalDurationSec > 0 ? words.length / (totalDurationSec / 60) : 0;

  return {
    words: words.length,
    totalDurationSec: r2(totalDurationSec),
    speakingDurationSec: r2(speakingDurationSec),
    spanSec: r2(spanSec),
    wpm: r1(wpm),
    overallWpm: r1(overallWpm),
    fillerCount: fillers.length,
    heuristicFillerCount: fillers.filter((f) => f.heuristic).length,
    fillers,
    fillerByWord,
    fillersPerMin: spanMin > 0 ? r1(fillers.length / spanMin) : 0,
    pauseCount: pauses.length,
    pauses,
    pausesPerMin: spanMin > 0 ? r1(pauses.length / spanMin) : 0,
    longestPause: r2(longestPause),
  };
}
