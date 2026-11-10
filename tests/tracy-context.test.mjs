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
  const loading = setup({ loading: true, u: { name: 'Alex Rivera' } }).snapshot();
  assert.equal(loading.dataStatus, 'loading'); assert.equal(loading.profile.displayName, 'Alex Rivera');
  assert.equal(loading.results, undefined); assert.equal(loading.workspace, undefined);
  assert.doesNotThrow(() => validateBody({ message: 'What is my name?', context: loading }));
  const value = setup({ ses: [], pres: [] }).snapshot();
  assert.deepEqual(value.results, []); assert.deepEqual(value.comparison, []); assert.equal(value.baseline, null);
});

test('Tracy sees the current displayed name and workspace without receiving credentials or contact details', () => {
  const s = setup({ u: { name: 'Alex Rivera', email: 'secret-email', pic: 'secret-picture' },
    goals: [{ t: 'Two rehearsals', metric: 'sessions', target: 2 }], notes: [{ t: 'Practice reminder', s: 'Rehearse your introduction.', r: 0 }],
    access_token: 'secret-token', ev: { done: true } });
  let value = s.snapshot();
  assert.equal(value.profile.displayName, 'Alex Rivera'); assert.equal(value.pageTitle, 'Performance');
  assert.deepEqual(value.workspace, { presentationCount: 1, totalSessionCount: 3, analyzedPracticeCount: 3, goalCount: 1, unreadNotificationCount: 1, evaluationComplete: true, recordingActive: false });
  assert.equal(value.presentations[0].title, 'Research'); assert.equal(value.presentations[0].hasSlideText, true);
  assert.equal(value.goals[0].progressPercent, 100); assert.equal(value.goals[0].measured, true);
  assert.equal(value.notifications[0].read, false);
  assert.ok(!/secret-|private-path/.test(JSON.stringify(value)));
  assert.doesNotThrow(() => validateBody({ message: 'What can you see?', context: value }));
  s.S.u.name = 'Updated Name'; s.S.view = 'set'; s.S.notes[0].r = 1;
  value = s.snapshot(); assert.equal(value.profile.displayName, 'Updated Name'); assert.equal(value.pageTitle, 'Settings');
  assert.equal(value.workspace.unreadNotificationCount, 0);
});

test('welcome includes available name without leaking initial demo records; missing names stay unknown', () => {
  const value = setup({ booted: false, u: { name: 'Sam' } }).snapshot();
  assert.equal(value.pageTitle, 'Welcome'); assert.equal(value.profile.displayName, 'Sam');
  assert.equal(value.presentations, undefined); assert.equal(value.results, undefined);
  assert.equal(setup({ u: {} }).snapshot().profile.displayName, null);
});

test('large workspaces keep total counts, bounded lists and valid context within the provider budget', () => {
  const s = setup({ pres: Array.from({ length: 30 }, (_, i) => ({ id: i ? i : 'deck-a', t: 'T'.repeat(160), context: { text: 'X'.repeat(20000) } })),
    goals: Array.from({ length: 15 }, () => ({ t: 'G'.repeat(200), metric: 'manual', p: 50 })),
    notes: Array.from({ length: 20 }, () => ({ t: 'N'.repeat(160), s: 'D'.repeat(300), r: 0 })),
    ses: Array.from({ length: 10 }, (_, i) => ({ id: i, deckId: 'deck-a', deck: 'R'.repeat(160), analysis: { feedback: { summary: 'F'.repeat(1200) } }, wpm: 150 })) });
  const value = s.snapshot();
  assert.equal(value.workspace.presentationCount, 30); assert.equal(value.presentations.length, 10);
  assert.equal(value.workspace.goalCount, 15); assert.equal(value.goals.length, 5);
  assert.equal(value.workspace.unreadNotificationCount, 20); assert.equal(value.notifications.length, 3);
  assert.ok(JSON.stringify(value).length <= 19000);
  assert.doesNotThrow(() => validateBody({ message: 'Summarize my workspace', context: value }));
});
test('baseline and explicit comparison mirror the performance page', () => {
  const s = setup({ ev: { results: { source: 'recorded-evaluation', contentValidation: { eligible: true }, metrics: { words: 120, totalDurationSec: 60, fillerCount: 2, pauseCount: 1 } } } });
  assert.deepEqual(s.snapshot().comparison.map(x => x.id), ['baseline', '3']);
  assert.equal(s.snapshot().baseline.score, null);
  s.S.compareA = '3'; s.S.compareB = '1';
  assert.deepEqual(s.snapshot().comparison.map(x => x.id), ['3', '1']);
});
test('backend context rejects extra identities, invalid scores and oversized slide text', () => {
  const snapshot = setup().snapshot();
  const bad = [ { ...snapshot, token: 'secret' }, { profile: { displayName: 'Alex', email: 'secret' } }, { profile: { displayName: 'x'.repeat(161) } }, { presentation: { title: 'x', text: 'x'.repeat(8001), truncated: true } },
    { results: [{ ...snapshot.results[0], score: 'invented' }] }, { ...snapshot, results: Array(5).fill(snapshot.results[0]) } ];
  for (const context of bad) assert.throws(() => validateBody({ message: 'Hi', context }), { status: 400 });
  const messages = validateBody({ message: 'What does this mean?', context: snapshot, language: 'taglish' });
  assert.match(messages.at(-1).content, /untrusted data/); assert.match(messages.at(-1).content, /175/);
  assert.equal(messages.at(-1).role, 'user');
});
