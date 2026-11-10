import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const deck = await readFile(new URL('../assets/evaluation/study-habits.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../js/evaluation.js', import.meta.url), 'utf8');
function setup() {
  const elements = new Map();
  const classes = () => {
    const values = new Set();
    return { add: (...a) => a.forEach(v => values.add(v)), remove: (...a) => a.forEach(v => values.delete(v)), contains: v => values.has(v), toggle: (v, on) => on ? values.add(v) : values.delete(v) };
  };
  const el = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', isConnected: true, classList: classes(), addEventListener() {} });
    return elements.get(id);
  };
  const S = { view: 'eval', evalRequired: false, pres: [], ses: [] }, V = {}, B = {}, PARENT = {};
  const X = { S, V, B, PARENT, esc: String, page: (...a) => a.join(''), sec: (t, i, h) => t + h, fmt: String };
  const context = { loadModule: path => import(new URL(path, new URL('../js/evaluation.js', import.meta.url))), clearInterval() {}, window: {}, podium: { ext: X }, document: { body: { classList: classes() }, getElementById: el, addEventListener() {} } };
  vm.runInNewContext(deck, context); vm.runInNewContext(source.replaceAll('import(', 'loadModule('), context);
  return { S, V, B, PARENT, el, context, deck: context.window.PT_EVALUATION_DECK };
}
test('Evaluation is separate and available to existing accounts without adding an uploaded presentation', () => {
  const app = setup();
  const html = app.V.eval();
  assert.match(html, /Full screen/);
  assert.doesNotMatch(html, /HOW IT WORKS|No upload required|BUILT-IN PRESENTATION/);
  assert.ok(html.indexOf('id="erec"') < html.indexOf('id="eslide"'));
  assert.equal(app.PARENT.eval, undefined);
  assert.equal(app.PARENT.evres, 'eval');
  assert.equal(app.S.pres.length, 0);
});
test('built-in deck loads immediately and all five slides have bounded navigation', () => {
  const app = setup(); app.B.eval();
  assert.equal(app.deck.slides.length, 5);
  assert.match(app.el('eslide').innerHTML, /My name is \[Your Name\]/);
  assert.equal(app.el('eprev').disabled, true);
  for (let i = 1; i < 5; i++) {
    app.el('enext').onclick();
    for (const line of app.deck.slides[i].bullets) assert.ok(app.el('eslide').innerHTML.includes(line));
  }
  assert.equal(app.el('enext').disabled, true);
  app.el('enext').onclick(); assert.equal(app.el('eslide-count').textContent, 'Slide 5 / 5');
  app.el('eprev').onclick(); assert.equal(app.el('eslide-count').textContent, 'Slide 4 / 5');
});
test('completed baseline refreshes feedback from measurements', async () => {
  const app = setup(); await app.context.podium.loadMeasuredReport();
  app.S.ev = { done: true, results: { source: 'recorded-evaluation', contentValidation: { eligible: true }, score: 75, metrics: {}, feedback: { recommendations: ['Pause between ideas.'] } } };
  assert.match(app.V.eval(), /WHAT TO PRACTICE NEXT/);
  assert.doesNotMatch(app.V.eval(), /Pause between ideas/);
  assert.match(app.V.eval(), /measurements are incomplete/);
  assert.match(app.V.eval(), /data-act="eretake"/);
});
test('expanded deck provides about two to two-and-a-half minutes at the target speaking pace', () => {
  const app = setup();
  const words = app.deck.slides.flatMap(s => s.bullets).join(' ').split(/\s+/).length;
  assert.ok(words / 160 * 60 >= 120);
  assert.ok(words / 130 * 60 <= 150);
  assert.equal(app.deck.version, 2);
  app.B.eval();
  assert.match(app.el('eslide').innerHTML, /evaluation-script/);
});
test('fullscreen fallback preserves slides and cleans up when leaving Evaluation', () => {
  const app = setup(); app.B.eval();
  app.el('enext').onclick();
  app.el('efs').onclick();
  assert.equal(app.el('evalviewer').classList.contains('evaluation-fullscreen'), true);
  assert.equal(app.el('efs').textContent, 'Exit full screen');
  assert.equal(app.el('eslide-count').textContent, 'Slide 2 / 5');
  app.context.podium.leave();
  assert.equal(app.el('evalviewer').classList.contains('evaluation-fullscreen'), false);
  assert.equal(app.context.document.body.classList.contains('evaluation-fullscreen-open'), false);
});
test('results visualize saved scores and explain an empty event timeline', async () => {
  const app = setup(); await app.context.podium.loadMeasuredReport();
  app.S.ev = { done: true, results: { source: 'recorded-evaluation', contentValidation: { eligible: true }, score: 50, metrics: { wpm: 103, fillerCount: 0, pauseCount: 0 }, dims: { pace: { points: 0, label: 'Slow pace' } }, quality: { level: 'low' }, feedback: {} } };
  const html = app.V.evres();
  assert.match(html, /Baseline score 50 out of 100/);
  assert.match(html, /Pace 103 WPM; target 100 to 160 WPM/);
  assert.match(html, /No filler or long-pause markers were detected/);
  assert.match(html, /er-method" open/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('browser-only and unvalidated evaluations cannot display a baseline score', () => {
  for (const results of [{ source: 'browser-speech-recognition', score: 75 }, { source: 'recorded-evaluation', score: 100, contentValidation: { eligible: false } }]) {
    const app = setup(); app.S.ev = { done: true, results };
    const html = app.V.evres();
    assert.doesNotMatch(html, /BASELINE SCORE|Baseline score \d/);
    assert.match(html, /Retake evaluation/);
  }
});

test('verbatim fillers without timestamps do not get fabricated timeline markers', async () => {
  const app = setup(); await app.context.podium.loadMeasuredReport(); app.S.ev = { done: true, results: { source: 'recorded-evaluation', contentValidation: { eligible: true }, score: 75,
    metrics: { fillerCount: 1, pauseCount: 0, fillers: [{word:'um',t:null}], totalDurationSec:120 } } };
  const html = app.V.evres();
  assert.doesNotMatch(html, /um at/); assert.match(html, /no precise positions/);
});


test('saved feedback is refreshed and the filler card lists the exact measured words', async () => {
  const app=setup(); await app.context.podium.loadMeasuredReport();
  const metrics={wpm:130,totalDurationSec:150,fillerCount:3,fillersPerMin:1.2,pauseCount:0,pausesPerMin:0,
    fillers:[{word:'ano',t:null},{word:'hmm',t:null},{word:'ano',t:12}]};
  const saved={source:'recorded-evaluation',contentValidation:{eligible:true},score:100,metrics,
    feedback:{strengths:['No filler words detected.'],improvements:['You said um and uh.'],recommendations:[]}};
  app.S.ev={done:true,results:saved};
  const html=app.V.evres();
  assert.match(html,/3<small>detected/);assert.match(html,/ano \u00d7 2, hmm \u00d7 1/);
  assert.match(html,/Only 3 possible filler words/);
  assert.doesNotMatch(html,/You said um and uh|No filler words detected\./);
  assert.equal(saved.feedback.improvements[0],'You said um and uh.','display refresh must not overwrite account history');
  metrics.fillerCount=0;metrics.fillersPerMin=0;metrics.fillers=[];
  const zero=app.V.evres();assert.match(zero,/0<small>detected/);assert.match(zero,/No filler words were detected/);
  assert.doesNotMatch(zero,/Only 3 possible filler words|You said um and uh/);
});

test('limited topic coverage displays delivery results and survives feedback refresh', async () => {
  const app=setup(); await app.context.podium.loadMeasuredReport();
  app.S.ev={done:true,results:{source:'recorded-evaluation',score:75,
    contentValidation:{eligible:true,referenceChecked:true,topicStatus:'limited_coverage'},
    metrics:{wpm:130,totalDurationSec:150,fillerCount:2,fillersPerMin:.8,pauseCount:1,pausesPerMin:.4},feedback:{}}};
  const html=app.V.evres();
  assert.match(html,/Baseline score 75 out of 100/);
  assert.match(html,/limited overlap with the slide topic/);
  assert.match(html,/Relate each slide to your main message/);
  assert.doesNotMatch(html,/passed the slide-content check|No baseline awarded/);
});
