import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateBody } from '../server/chat.mjs';
const model = await readFile(new URL('../js/workspace-model.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../js/tracy-context.js', import.meta.url), 'utf8');
function setup(overrides = {}, fields = {}) {
  const S = { booted: true, view: 'perf', compareDeck: 'deck-a', reviewMetric: 'wpm',
    pres: [{ id: 'deck-a', t: 'Research', context: { text: 'Our real slide content' }, file: 'private-path' }],
    ses: [{ id: 1, deckId: 'deck-a', deck: 'Research', wpm: 175, fill: 0, pau: 3, dur: 120, tg: 180, score: 60, analysis: { feedback: { recommendations: ['Pause between ideas.'] } } },
      { id: 2, deckId: 'other', deck: 'Unrelated', wpm: 90, analysis: {} },
      { id: 3, deckId: 'deck-a', deck: 'Research', wpm: 150, fill: 2, pau: 1, dur: 150, tg: 180, score: 80, analysis: {} }], ...overrides };
  const context = { podium: { ext: { S } }, document: { getElementById: id => fields[id] } };
  vm.createContext(context); vm.runInContext(model, context); vm.runInContext(source, context);
  return { S, snapshot: () => JSON.parse(JSON.stringify(context.TracyContext.snapshot())) };
}
test('snapshot uses selected real results, visible default comparison and bounded slide content', () => {
  const s = setup(), value = s.snapshot();
  assert.deepEqual(value.results.map(x => x.wpm), [175, 150]);
  assert.equal(value.results[0].fillers, 0);
  assert.match(value.results[0].feedback, /Pause between ideas/);
  assert.deepEqual(value.comparison.map(x => x.id), ['1', '3']);
  assert.equal(value.presentation.text, 'Our real slide content');
  assert.ok(!JSON.stringify(value).includes('private-path'));
  assert.doesNotThrow(() => validateBody({ message: 'Compare these', context: value }));
  s.S.pres[0].context.text = 'x'.repeat(20000);
  assert.equal(s.snapshot().presentation.text.length, 8000);
  assert.equal(s.snapshot().presentation.truncated, true);
});
test('report and practice selection override unrelated review filters; missing metrics stay null', () => {
  const s = setup({ view: 'rdet', arg: 2 }), value = s.snapshot();
  assert.equal(value.results.length, 1); assert.equal(value.results[0].wpm, 90);
  assert.equal(value.results[0].score, null);
  assert.equal(value.presentation, null);
  const practice = setup({ view: 'prac', arg: 'other' }, { pd: { value: 'deck-a' } }).snapshot();
  assert.equal(practice.presentation.title, 'Research');
});
test('empty and loading pages never acquire sample performance data', () => {
  assert.deepEqual(setup({ loading: true }).snapshot(), {});
  const value = setup({ ses: [], pres: [] }).snapshot();
  assert.deepEqual(value.results, []); assert.deepEqual(value.comparison, []); assert.equal(value.baseline, null);
});
test('baseline and explicit comparison mirror the performance page', () => {
  const s = setup({ ev: { results: { metrics: { words: 120, totalDurationSec: 60, fillerCount: 2, pauseCount: 1 } } } });
  assert.deepEqual(s.snapshot().comparison.map(x => x.id), ['baseline', '3']);
  assert.equal(s.snapshot().baseline.score, null);
  s.S.compareA = '3'; s.S.compareB = '1';
  assert.deepEqual(s.snapshot().comparison.map(x => x.id), ['3', '1']);
});
test('backend context rejects extra identities, invalid scores and oversized slide text', () => {
  const snapshot = setup().snapshot();
  const bad = [ { ...snapshot, token: 'secret' }, { presentation: { title: 'x', text: 'x'.repeat(8001), truncated: true } },
    { results: [{ ...snapshot.results[0], score: 'invented' }] }, { ...snapshot, results: Array(5).fill(snapshot.results[0]) } ];
  for (const context of bad) assert.throws(() => validateBody({ message: 'Hi', context }), { status: 400 });
  const messages = validateBody({ message: 'What does this mean?', context: snapshot, language: 'taglish' });
  assert.match(messages.at(-1).content, /untrusted data/); assert.match(messages.at(-1).content, /175/);
  assert.equal(messages.at(-1).role, 'user');
});
