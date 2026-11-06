import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const deck = await readFile(new URL('../assets/evaluation/study-habits.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../js/evaluation.js', import.meta.url), 'utf8');
function setup() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', addEventListener() {} });
    return elements.get(id);
  };
  const S = { view: 'eval', evalRequired: false, pres: [], ses: [] }, V = {}, B = {}, PARENT = {};
  const X = { S, V, B, PARENT, esc: String, page: (...a) => a.join(''), sec: (t, i, h) => t + h, fmt: String };
  const context = { window: {}, podium: { ext: X }, document: { getElementById: el, addEventListener() {} } };
  vm.runInNewContext(deck, context); vm.runInNewContext(source, context);
  return { S, V, B, PARENT, el, deck: context.window.PT_EVALUATION_DECK };
}
test('Evaluation is separate and available to existing accounts without adding an uploaded presentation', () => {
  const app = setup();
  assert.match(app.V.eval(), /No upload required/);
  assert.match(app.V.eval(), /does not use a free upload/);
  assert.equal(app.PARENT.eval, undefined);
  assert.equal(app.PARENT.evres, 'eval');
  assert.equal(app.S.pres.length, 0);
});
test('built-in deck loads immediately and all five slides have bounded navigation', () => {
  const app = setup(); app.B.eval();
  assert.equal(app.deck.slides.length, 5);
  assert.match(app.el('eslide').innerHTML, /Presented by: \[Your Name\]/);
  assert.equal(app.el('eprev').disabled, true);
  for (let i = 1; i < 5; i++) {
    app.el('enext').onclick();
    for (const line of app.deck.slides[i].bullets) assert.ok(app.el('eslide').innerHTML.includes(line));
  }
  assert.equal(app.el('enext').disabled, true);
  app.el('enext').onclick(); assert.equal(app.el('eslide-count').textContent, 'Slide 5 / 5');
  app.el('eprev').onclick(); assert.equal(app.el('eslide-count').textContent, 'Slide 4 / 5');
});
test('completed baseline stays accessible with next-practice feedback', () => {
  const app = setup();
  app.S.ev = { done: true, results: { metrics: {}, feedback: { recommendations: ['Pause between ideas.'] } } };
  assert.match(app.V.eval(), /WHAT TO PRACTICE NEXT/);
  assert.match(app.V.eval(), /Pause between ideas/);
});
