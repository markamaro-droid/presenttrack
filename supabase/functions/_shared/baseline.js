// Baseline for accounts that already have practice history (they skip the evaluation).
// Pure: no browser/Deno globals. Reuses classify.js so the pace/filler/pause thresholds stay in criteria.js.
import { CRITERIA } from './criteria.js';
import { classify } from './classify.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r1 = (n) => Math.round(n * 10) / 10;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// sessions: [{dur, wpm, fill, pau, score, assess?}] oldest -> newest (as stored in the app).
// Returns null when there is not enough usable history.
export function baselineFromSessions(sessions, criteria = CRITERIA) {
  const B = criteria.baseline;
  const usable = (Array.isArray(sessions) ? sessions : []).filter(
    (s) => s && !s.assess && num(s.dur) >= B.minSessionSec && num(s.wpm) > 0,
  );
  if (usable.length < B.minSessions) return null;
  const win = usable.slice(-B.recentSessions);

  const totalSec = win.reduce((a, s) => a + num(s.dur), 0);
  const mins = totalSec / 60;
  const wpm = win.reduce((a, s) => a + num(s.wpm) * num(s.dur), 0) / totalSec; // weighted by length
  const fillerCount = win.reduce((a, s) => a + Math.max(0, num(s.fill)), 0);
  const pauseCount = win.reduce((a, s) => a + Math.max(0, num(s.pau)), 0);
  const metrics = {
    wpm: r1(wpm),
    fillerCount,
    fillersPerMin: r1(fillerCount / mins),
    pauseCount,
    pausesPerMin: r1(pauseCount / mins),
    longestPause: 0, // not stored for past sessions
    totalDurationSec: Math.round(totalSec / win.length),
  };

  const res = classify(metrics, { level: 'ok' }, criteria);
  const dims = { pace: res.dims.pace, fillers: res.dims.fillers, pauses: res.dims.pauses };
  const P = criteria.scoring.points;
  const maxPoints = 3 * P.good;
  const totalPoints = dims.pace.points + dims.fillers.points + dims.pauses.points;
  const hasZero = Object.values(dims).some((d) => d.points === P.poor);
  const classification = totalPoints >= B.proficientMin && !hasZero ? 'proficient'
    : totalPoints >= B.developingMin ? 'developing' : 'needs_improvement';

  // Trend: average of the saved per-session scores, older half vs newer half.
  let trend = null;
  const scored = win.filter((s) => Number.isFinite(Number(s.score)));
  if (scored.length >= B.trendMinSessions) {
    const h = Math.floor(scored.length / 2);
    const change = Math.round(avg(scored.slice(-h).map((s) => num(s.score))) - avg(scored.slice(0, h).map((s) => num(s.score))));
    trend = { change, direction: change >= 3 ? 'up' : change <= -3 ? 'down' : 'steady' };
  }

  const strengths = [];
  const improvements = [];
  const c = criteria;
  if (dims.pace.points === P.good) strengths.push(`Your pace (about ${metrics.wpm} WPM) is in the comfortable ${c.pace.idealMin}-${c.pace.idealMax} range.`);
  else improvements.push(metrics.wpm < c.pace.idealMin
    ? `Your pace (about ${metrics.wpm} WPM) is slower than the comfortable ${c.pace.idealMin}-${c.pace.idealMax} range. A little more energy can help.`
    : `Your pace (about ${metrics.wpm} WPM) is faster than the comfortable ${c.pace.idealMin}-${c.pace.idealMax} range. Pause briefly after key points.`);
  if (dims.fillers.points === P.good) strengths.push(`You use few filler words (about ${metrics.fillersPerMin} per minute).`);
  else improvements.push(`You average about ${metrics.fillersPerMin} filler words per minute (aim for ${c.fillers.perMinuteGood} or fewer). Replace them with a short silent pause.`);
  if (dims.pauses.points === P.good) strengths.push('Your delivery flows without many long pauses.');
  else improvements.push(`You average about ${metrics.pausesPerMin} long pauses per minute (aim for ${c.pauses.perMinuteGood} or fewer). Rehearse your transitions between slides.`);
  if (trend && trend.direction === 'up') strengths.push(`Your recent sessions score about ${trend.change} points higher than your earlier ones.`);
  if (trend && trend.direction === 'down') improvements.push(`Your recent sessions score about ${Math.abs(trend.change)} points lower than your earlier ones.`);

  return {
    sessionsUsed: win.length,
    metrics,
    dims,
    totalPoints,
    maxPoints,
    score: Math.round((totalPoints / maxPoints) * 100),
    avgSessionScore: Math.round(avg(scored.map((s) => num(s.score)))),
    classification,
    trend,
    strengths,
    improvements,
  };
}
