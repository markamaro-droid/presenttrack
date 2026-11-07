import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const model = await readFile(new URL('../js/workspace-model.js', import.meta.url), 'utf8');
const views = await readFile(new URL('../js/workspace.js', import.meta.url), 'utf8');
function setup() {
  const S = { ses: [], pres: [], goals: [], notes: [], u: { name: 'Student' } }, V = {}, B = {};
  const context = { podium: { ext: { S, V, B, esc: v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'), fmt: n => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2,'0')}`, ic: () => '<svg></svg>', I: {}, render: () => {}, pendingEval: () => false } } };
  vm.runInNewContext(model, context); vm.runInNewContext(views, context);
  const elements = {};
  context.document = { getElementById: id => elements[id] ||= { focus() {} }, querySelectorAll: () => [] };
  return { S, V, B, elements, M: context.PTWorkspaceModel };
}
const session = (id, deckId, extra = {}) => ({ id, deckId, deck: 'Defense', d: 'Nov 7', at: `2026-11-0${id}T10:00:00Z`, dur: 120, tg: 120, wpm: 120, fill: 2, pau: 1, score: 75, analysis: { feedback: { recommendations: ['Use examples.'] } }, ...extra });
test('selection isolates presentations, analyzed sources and date windows without mutating history', () => {
  const { M } = setup(), input = [session(1, 1), session(7, 2), session(6, 1), session(5, 1, { analysis: null }), session(4, 1, { assess: true })];
  const selected = M.select(input, { deck: '1', days: 3 }, Date.parse('2026-11-07T12:00:00Z'));
  assert.deepEqual(Array.from(selected, s => s.id), [6]); assert.equal(input[0].id, 1);
  assert.equal(M.select(input, { type: 'all' }).length, 5);
});
test('unknown timestamps are not invented for ranged history', () => {
  const { M } = setup(), s = session(1, 1, { at: undefined });
  assert.equal(M.select([s], { days: 30 }).length, 0); assert.equal(M.select([s]).length, 1);
});
test('comparison uses rates and missing data stays unavailable', () => {
  const { M } = setup(); assert.equal(M.value(session(1, 1), 'fillerRate'), 1);
  assert.equal(M.value(session(1, 1, { dur: 0 }), 'pauseRate'), null);
  assert.equal(M.value({ score: null }, 'score'), null);
  assert.equal(M.value({}, 'wpm'), null);
});
test('baseline is separate, uses full duration and does not reuse an old score', () => {
  const { M } = setup(), b = M.baseline({ results: { score: 75, metrics: { words: 253, totalDurationSec: 148, fillerCount: 1, pauseCount: 0 } } });
  assert.equal(b.wpm, 103); assert.equal(b.score, null); assert.equal(b.assess, true);
});
test('goals calculate actual scope, support zero fillers and leave absent observations pending', () => {
  const { M } = setup(), list = [session(1, 1), session(2, 2), session(3, 1, { fill: 0 })];
  assert.equal(M.goal({ metric: 'sessions', target: 3, deckId: 1 }, list).percent, 67);
  assert.equal(M.goal({ metric: 'fillerRate', target: 2, deckId: 1 }, list).percent, 100);
  assert.equal(M.goal({ metric: 'fillerRate', target: 0, deckId: 1 }, list).percent, 100);
  assert.equal(M.goal({ metric: 'fillerRate', target: 0, deckId: 2 }, list).percent, 0);
  assert.equal(M.goal({ metric: 'score', target: 80, deckId: 3 }, list).actual, null);
  assert.equal(M.goal({ t: 'Old goal', p: 200 }, []).percent, 100);
});
test('readiness uses analyzed attempts, not legacy rows or other presentations', () => {
  const { M } = setup(), p = { id: 1, ppt: true, sp: true, rq: true, final: true, scheduledDate: '2026-11-08' };
  const list = [session(1, 1), session(2, 1), session(3, 1, { analysis: null }), session(4, 2)];
  assert.equal(M.preparation(p, list).percent, 83);
  list.push(session(5, 1)); assert.equal(M.preparation(p, list).percent, 100);
});
test('CSV preserves quotes and prevents spreadsheet formula execution', () => {
  const { M } = setup(), csv = M.csv([session(1, 1, { deck: '=HYPERLINK("bad")' })]);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/); assert.match(csv, /Recorded audio/);
  assert.doesNotMatch(csv, /transcript/);
});
test('schedule countdown uses calendar days, including today and past events', () => {
  const { M } = setup(), now = new Date(2026, 10, 7, 23, 50).getTime();
  assert.equal(M.preparation({ id: 1, scheduledDate: '2026-11-07' }, [], now).days, 0);
  assert.equal(M.preparation({ id: 1, scheduledDate: '2026-11-08' }, [], now).days, 1);
  assert.equal(M.preparation({ id: 1, scheduledDate: '2026-11-06' }, [], now).days, -1);
});
test('empty progress offers clearly labelled sample charts without changing account data', () => {
  const { S, V } = setup(); assert.match(V.perf(), /Make your first rehearsal count/);
  S.ev = { results: { metrics: { totalDurationSec: 148, words: 253, fillerCount: 1, pauseCount: 0 } } };
  assert.match(V.perf(), /Your baseline is ready/);
  const before = JSON.stringify(S);
  for (const key of ['score', 'wpm', 'fillerRate', 'pauseRate', 'dur']) {
    S.reviewMetric = key;
    const html = V.prog();
    assert.match(html, /fictional practice data/);
    assert.match(html, /across 6 sample rehearsals/);
    assert.match(html, /View chart data/);
    assert.doesNotMatch(html, /data-go="rdet"/);
  }
  delete S.reviewMetric;
  assert.equal(JSON.stringify(S), before);
});
test('populated performance supports distinct selection and progress data has accessible fallback', () => {
  const { S, V } = setup(); S.ses = [session(1, 1), session(2, 1, { deck: '<img onerror=alert(1)>', score: 50 })];
  const html = V.perf(); assert.match(html, /id="ws-a"/); assert.match(html, /Change: -25/); assert.doesNotMatch(html, /<img onerror/);
  const progress = V.prog(); assert.match(progress, /class="ws-chart"/); assert.match(progress, /View chart data/);
  S.compareA = S.compareB = '1'; assert.match(V.perf(), /Choose two different attempts/);
});
test('filtered-out rehearsals are not mixed into another presentation chart', () => {
  const { S, V } = setup(); S.ses = [session(1, 1)]; S.compareDeck = '2';
  assert.match(V.prog(), /No rehearsals match/); assert.doesNotMatch(V.prog(), /class="ws-chart"/);
});

test('preview switch restores real data and filters without creating sessions', () => {
  const { S, V, B, elements } = setup();
  V.prog(); B.prog(); elements['ws-preview'].onclick();
  assert.doesNotMatch(V.prog(), /class="ws-chart"/);
  assert.match(V.prog(), /id="ws-deck"/);
  S.ses = [session(1, 1)];
  B.prog(); elements['ws-preview'].onclick();
  assert.match(V.prog(), /across 6 sample rehearsals/);
  B.prog(); elements['ws-preview'].onclick();
  assert.match(V.prog(), /across 1 recorded rehearsals/);
  assert.equal(S.ses.length, 1);
  assert.equal(S.goals.length, 0);
});
