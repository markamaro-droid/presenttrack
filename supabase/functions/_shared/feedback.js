// Feedback: rule-based fallback + sanitizer for model output. Pure.
const LIM = { summary: 600, item: 240, maxItems: 5 };

export function cleanText(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateFeedback(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const list = (v) => (Array.isArray(v) ? v : [])
    .filter((x) => typeof x === 'string')
    .map((x) => cleanText(x, LIM.item)).filter(Boolean).slice(0, LIM.maxItems);
  if (typeof obj.summary !== 'string') return null;
  const out = {
    summary: cleanText(obj.summary, LIM.summary),
    strengths: list(obj.strengths),
    improvements: list(obj.improvements),
    recommendations: list(obj.recommendations),
  };
  if (!out.summary) return null;
  if (!out.strengths.length && !out.improvements.length && !out.recommendations.length) return null;
  return out;
}

// `result` is the object returned by classify().
export function ruleBasedFeedback(metrics, result) {
  if (result?.score === null) return { summary: 'No baseline was awarded because reliable speech measurements are incomplete.', strengths: [],
    improvements: ['The recording could not be scored reliably.'], recommendations: ['Check the microphone and record the presentation again.'] };
  const m = metrics || {};
  const dims = (result && result.dims) || {};
  const pts = (k) => (dims[k] ? dims[k].points : 0);
  const strengths = [];
  const improvements = [];
  const recommendations = [];

  if (pts('pace') === 2) strengths.push('Your estimated pace falls within the presentation reference range. There is no need to speed up just to chase a WPM target.');
  else if (dims.pace?.direction === 'slower') { improvements.push('Your estimated pace is below the reference range. Missed words and pauses can lower this estimate; this does not prove your delivery was too slow.'); recommendations.push('Check the recognized transcript for missed words, then ask a listener whether the pace feels clear before changing your speed.'); }
  else { improvements.push('Your estimated pace is above the reference range. Check whether a listener can follow your key points.'); recommendations.push('Mark key phrases in your notes and pause briefly after each one.'); }

  // Wording is derived from the measured counts, never only from the score tier,
  // so the feedback cannot contradict the "N detected" cards shown beside it.
  const count = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const fc = count(m.fillerCount);
  const pc = count(m.pauseCount);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const verb = (n) => (n === 1 ? 'was' : 'were');
  const perMin = Number.isFinite(Number(m.fillersPerMin)) && m.fillersPerMin !== null ? ` (about ${m.fillersPerMin} per minute)` : '';

  if (pts('fillers') === 2) {
    if (fc === 0) strengths.push('No filler words were detected. Automatic detection can miss some, so treat this as an estimate.');
    else if (fc === null) strengths.push('Few possible filler words were detected.');
    else strengths.push(`Only ${plural(fc, 'possible filler word', 'possible filler words')} ${verb(fc)} detected${perMin}.`);
  } else {
    improvements.push(fc === null
      ? 'Possible filler words (such as "um" or "uh") showed up fairly often. Automatic detection is imperfect, so this is an estimate.'
      : `${plural(fc, 'possible filler word', 'possible filler words')} (such as "um" or "uh") ${verb(fc)} detected${perMin}. Automatic detection is imperfect, so this is an estimate.`);
    recommendations.push('Replace a filler with a calm, short silent pause while you think.');
  }

  if (pts('pauses') === 2) {
    if (pc === 0) strengths.push('No long pauses (2 seconds or more) were detected.');
    else if (pc === null) strengths.push('Your delivery flowed without many long pauses.');
    else strengths.push(`Only ${plural(pc, 'long pause', 'long pauses')} (2 seconds or more) ${verb(pc)} detected, so your delivery mostly flowed.`);
  } else {
    const longest = Number.isFinite(Number(m.longestPause)) && Number(m.longestPause) > 0 ? `; the longest was ${m.longestPause} seconds` : '';
    improvements.push(pc === null
      ? 'There were several long pauses (2 seconds or more).'
      : `${plural(pc, 'long pause', 'long pauses')} of 2 seconds or more ${verb(pc)} detected${longest}.`);
    recommendations.push('Rehearse your transitions between slides so the next point comes to mind quickly.');
  }

  const ds = result && result.durationAssessment && result.durationAssessment.status;
  if (ds === 'within_range') strengths.push('Your talk length was within the 2-3 minute target.');
  else if (ds === 'too_short') { improvements.push('Your recording was shorter than the 2-3 minute target.'); recommendations.push('Add one more detail or example to each main point.'); }
  else if (ds === 'too_long') { improvements.push('Your recording was longer than the 2-3 minute target.'); recommendations.push('Trim each point to its most important sentence.'); }

  if (!strengths.length) strengths.push('You completed a full baseline recording, which is a great starting point.');
  recommendations.push('Record again in a few weeks and compare your results to track progress.');

  const label = { proficient: 'a strong baseline', developing: 'a developing baseline', needs_improvement: 'a baseline with room to grow' }[result && result.classification] || 'a baseline';
  return {
    summary: `This recording shows ${label}. It reflects pace, possible filler words, long pauses and length only, so treat it as a starting point rather than a final judgment.`,
    strengths: strengths.slice(0, LIM.maxItems),
    improvements: improvements.slice(0, LIM.maxItems),
    recommendations: recommendations.slice(0, LIM.maxItems),
  };
}
