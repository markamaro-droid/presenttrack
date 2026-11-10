import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, ruleBasedFeedback } from '../functions/_shared/feedback.js';
import { classify } from '../functions/_shared/classify.js';

test('validateFeedback rejects junk', () => {
  for (const v of [null, 'x', [], {}, { summary: 5 }, { summary: '  ' }, { summary: 'ok' }]) assert.equal(validateFeedback(v), null);
});
test('validateFeedback clamps and strips', () => {
  const out = validateFeedback({
    summary: 'a\u0000b'.repeat(500),
    strengths: ['good', 5, null, 'x'.repeat(1000), 'a', 'b', 'c', 'd'],
    improvements: 'nope',
    recommendations: ['do this'],
    extra: 'dropped',
  });
  assert.ok(out.summary.length <= 600 && !/\u0000/.test(out.summary));
  assert.equal(out.strengths.length, 5);
  assert.ok(out.strengths.every((s) => typeof s === 'string' && s.length <= 240));
  assert.deepEqual(out.improvements, []);
  assert.equal(out.extra, undefined);
});
test('ruleBasedFeedback always yields valid feedback and hedges', () => {
  const m = { wpm: 200, fillerCount: 20, pauseCount: 9, totalDurationSec: 60 };
  const r = classify({ ...m, fillersPerMin: 12, pausesPerMin: 9 }, { level: 'ok' });
  const fb = ruleBasedFeedback(m, r);
  assert.ok(validateFeedback(fb));
  assert.match(fb.summary, /baseline/i);
  assert.ok(fb.improvements.length >= 3);
  assert.ok(!/eye contact|gesture/i.test(JSON.stringify(fb)));
  assert.ok(validateFeedback(ruleBasedFeedback({}, null)));
});

test('feedback never contradicts the measured counts (zero fillers / zero pauses)', () => {
  const m = { wpm: 130, fillerCount: 0, fillersPerMin: 0, pauseCount: 0, pausesPerMin: 0, longestPause: 0, totalDurationSec: 150 };
  const r = classify(m, { level: 'ok' });
  assert.equal(r.dims.fillers.label, 'No fillers detected');
  assert.equal(r.dims.pauses.label, 'No long pauses');
  const text = JSON.stringify(ruleBasedFeedback(m, r));
  assert.match(text, /No filler words were detected/);
  assert.match(text, /No long pauses/);
  assert.ok(!/Few possible filler|flowed without many/.test(text), 'zero detected must not read as "few"');
});
test('feedback quotes the real filler and pause counts', () => {
  const few = { wpm: 130, fillerCount: 2, fillersPerMin: 1, pauseCount: 1, pausesPerMin: 0.5, longestPause: 2.4, totalDurationSec: 150 };
  const good = JSON.stringify(ruleBasedFeedback(few, classify(few, { level: 'ok' })));
  assert.match(good, /Only 2 possible filler words were detected/);
  assert.match(good, /Only 1 long pause \(2 seconds or more\) was detected/);
  const many = { wpm: 130, fillerCount: 14, fillersPerMin: 5.6, pauseCount: 6, pausesPerMin: 2.4, longestPause: 4.1, totalDurationSec: 150 };
  const bad = ruleBasedFeedback(many, classify(many, { level: 'ok' }));
  assert.ok(bad.improvements.some(t => /14 possible filler words/.test(t)));
  assert.ok(bad.improvements.some(t => /6 long pauses of 2 seconds or more were detected; the longest was 4.1 seconds/.test(t)));
});
