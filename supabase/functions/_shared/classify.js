// Baseline classification from several dimensions. Never WPM alone. Pure.
import { CRITERIA } from './criteria.js';

const EXPLANATION =
  'This is a BASELINE based on measurable speech patterns in one recording (pace, filler words, long pauses and length), ' +
  'not a definitive judgment of your ability. Eye contact, gestures, confidence and body language are NOT evaluated.';

function grade(points, labels, detail) {
  const label = points === 2 ? labels[0] : points === 1 ? labels[1] : labels[2];
  return { points, label, detail };
}

export function classify(metrics, quality, criteria = CRITERIA) {
  const P = criteria.scoring.points;
  const c = criteria;
  const m = metrics || {};
  // Missing measurements cannot earn "no fillers/no pauses" points or a baseline.
  if (quality?.level === 'unusable' || ['wpm', 'totalDurationSec', 'fillerCount', 'fillersPerMin', 'pauseCount', 'pausesPerMin'].some(k => typeof m[k] !== 'number' || !Number.isFinite(m[k]))) {
    return { dims: {}, totalPoints: null, maxPoints: criteria.scoring.maxPoints, criteriaVersion: criteria.version,
      score: null, classification: 'unclassified', durationAssessment: null, explanation: 'No score: reliable speech measurements are incomplete. Please record again.' };
  }

  // pace
  const wpm = Number(m.wpm) || 0;
  let pPts = P.poor;
  if (wpm >= c.pace.idealMin && wpm <= c.pace.idealMax) pPts = P.good;
  else if (wpm >= c.pace.acceptableMin && wpm <= c.pace.acceptableMax) pPts = P.ok;
  const paceDir = wpm < c.pace.idealMin ? 'slower' : 'faster';
  const pace = grade(pPts, ['Within presentation range', 'Near presentation range', wpm < c.pace.idealMin ? 'Below reference range' : 'Above reference range'],
    `Estimated ${wpm} words per minute (presentation reference ${c.pace.idealMin}-${c.pace.idealMax}${pPts === P.good ? '' : `; estimate is ${paceDir}`}). Pace alone does not establish clarity or listener comprehension.`);
  pace.direction = pPts === P.good ? 'within' : paceDir;

  // fillers
  const fr = Number(m.fillersPerMin) || 0;
  const fPts = fr <= c.fillers.perMinuteGood ? P.good : fr <= c.fillers.perMinuteOk ? P.ok : P.poor;
  const fillers = grade(fPts, ['Few fillers', 'Some fillers', 'Frequent fillers'],
    `About ${m.fillerCount || 0} possible filler words (${fr} per minute). Some may be recognition artifacts.`);

  // pauses
  const pr = Number(m.pausesPerMin) || 0;
  const paPts = pr <= c.pauses.perMinuteGood ? P.good : pr <= c.pauses.perMinuteOk ? P.ok : P.poor;
  const pauses = grade(paPts, ['Smooth flow', 'Some long pauses', 'Many long pauses'],
    `${m.pauseCount || 0} pause(s) of ${c.pauses.longPauseSec}s or more (${pr} per minute); longest ${m.longestPause || 0}s.`);

  // duration
  const d = Number(m.totalDurationSec) || 0;
  const D = c.duration;
  let dPts = P.poor;
  if (d >= D.targetMinSec && d <= D.targetMaxSec) dPts = P.good;
  else if (d >= D.acceptableMinSec && d <= D.acceptableMaxSec) dPts = P.ok;
  const durationAssessment = {
    status: d < D.targetMinSec ? 'too_short' : d > D.targetMaxSec ? 'too_long' : 'within_range',
    targetMinSec: D.targetMinSec,
    targetMaxSec: D.targetMaxSec,
  };
  const duration = grade(dPts, ['Right length', 'Near target length', durationAssessment.status === 'too_short' ? 'Too short' : 'Too long'],
    `Recording length ${Math.round(d)}s (target ${D.targetMinSec}-${D.targetMaxSec}s).`);

  const dims = { pace, fillers, pauses, duration };
  const totalPoints = pace.points + fillers.points + pauses.points + duration.points;
  const maxPoints = criteria.scoring.maxPoints;
  const hasZero = Object.values(dims).some((x) => x.points === 0);

  let classification;
  if (quality && quality.level === 'unusable') classification = 'unclassified';
  else if (totalPoints >= criteria.scoring.proficientMin && !hasZero) classification = 'proficient';
  else if (totalPoints >= criteria.scoring.developingMin) classification = 'developing';
  else classification = 'needs_improvement';

  let explanation = EXPLANATION;
  if (quality && quality.level === 'low') explanation += ' Recording quality was low, so treat this result as approximate.';

  return {
    dims, totalPoints, maxPoints, criteriaVersion: criteria.version,
    score: Math.round((totalPoints / maxPoints) * 100),
    classification, durationAssessment, explanation,
  };
}
