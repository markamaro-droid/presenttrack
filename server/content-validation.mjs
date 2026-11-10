// Eligibility checks, not a semantic accuracy score. Never reward number drills or repeated tokens.
const tokens = text => String(text || '').toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || [];
const numberWords = new Set('zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion point uno dos tres apat lima anim pito walo siyam sampu isa dalawa tatlo'.split(' '));
const stop = new Set('a an the and or but of in on at to for from with by is are was were be been being it its this that these those i my me you your name we our us they their them he she his her as not no do does did can could would should will may might have has had so than then when what how why who which all any some each other more most much many very just also about into out up down if instead without through there here now today first next finally thank thanks everyone'.split(' '));
const stem = word => word.length > 5 ? word.replace(/(?:ing|ed|es|s)$/, '') : word;
const numeric = word => /\d/u.test(word) || numberWords.has(word);
const meaningful = text => tokens(text).filter(w => !numeric(w) && !stop.has(w) && w.length > 2).map(stem);
export function validateContent(transcript, { reference = '', sections = [], durationSec, evaluation = false } = {}) {
  const words = tokens(transcript), content = meaningful(transcript), unique = new Set(content);
  const counts = new Map(); for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  const numericRatio = words.length ? words.filter(numeric).length / words.length : 0;
  const repeatedShare = words.length ? [...counts.values()].sort((a,b) => b-a).slice(0,3).reduce((a,b) => a+b,0) / words.length : 1;
  const expected = new Set(meaningful(reference));
  const matched = [...unique].filter(w => expected.has(w)).length;
  const coverage = expected.size ? matched / expected.size : null;
  const precision = unique.size && expected.size ? matched / unique.size : null;
  const sectionMatches = sections.filter(s => { const terms = new Set(meaningful(s)); return terms.size && [...terms].filter(w => unique.has(w)).length / terms.size >= .3; }).length;
  let reason = null;
  if (evaluation && durationSec < 90) reason = 'too_short';
  else if (evaluation && durationSec > 302) reason = 'too_long'; // Allow codec padding around the five-minute stop.
  else if (numericRatio > .35 || repeatedShare > .55 || unique.size < (evaluation ? 30 : 10)) reason = 'not_presentation_speech';
  else if (evaluation && (words.length < 120 || content.length < 50)) reason = 'insufficient_content';
  else if (expected.size >= 15 && (precision < .25 || (evaluation && (coverage < .5 || sectionMatches < Math.min(3, sections.length))))) reason = 'off_topic';
  return { version: 1, eligible: reason === null, reason, referenceChecked: expected.size >= 15,
    referenceCoverage: coverage === null ? null : Math.round(coverage * 100), topicPrecision: precision === null ? null : Math.round(precision * 100),
    matchedSections: sectionMatches, totalSections: sections.length, numericRatio: Math.round(numericRatio * 100) / 100, meaningfulWords: content.length };
}
export const contentMessage = reason => ({
  too_short: 'No baseline was awarded. Present the slide content for at least 90 seconds; aim for 2–3 minutes.',
  too_long: 'No baseline was awarded. Use an evaluation recording no longer than 5 minutes; aim for 2–3 minutes.',
  not_presentation_speech: 'No score was awarded. The recording contains mostly numbers, repeated words, or too little meaningful speech. Explain the presentation ideas in complete sentences and try again.',
  insufficient_content: 'No baseline was awarded. Explain more of the slide content in complete sentences, aiming for 2–3 minutes.',
  off_topic: 'No score was awarded because the recognized speech did not cover enough of the presentation ideas. Present the slides rather than counting or discussing an unrelated topic, and check your microphone before retrying.'
})[reason] || 'No score was awarded. Please record the presentation again.';
