import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/dashboard.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../js/tour-steps.js', import.meta.url), 'utf8');
function setup(state) {
  let time = 0, stopped = 0, advanced = 0;
  const elements = new Map(), timers = [];
  const T = { on:true, play:true, i:0, t0:0, est:3000, cc:null, generation:1 };
  const context = { T, performance:{now:()=>time}, $:id=>{if(!elements.has(id))elements.set(id,{style:{},hidden:true});return elements.get(id);},
    podium:{narState:()=>state,hushNow:()=>stopped++},tourSub(){},tourGo:()=>advanced++,setTimeout:fn=>timers.push(fn) };
  vm.runInNewContext(source.slice(source.indexOf('function tourTick(){'),source.indexOf('function startTour(){')),context);
  return { T, elements, tick:ms=>{time=ms;context.tourTick();},flush:()=>timers.splice(0).forEach(fn=>fn()),get stopped(){return stopped;},get advanced(){return advanced;} };
}
test('spoken labels use normal words while visible button labels remain exact',()=>{
  const context={window:{}};vm.runInNewContext(config,context);
  const steps=context.window.PTTourSteps;
  assert.equal(steps.find(s=>s.target==='#ua').title,'ADD PRESENTATION');
  assert.match(steps.find(s=>s.target==='#ua').voiceLine,/Add presentation/);
  assert.doesNotMatch(steps.map(s=>s.voiceLine).join(' '),/ADD|ANALYZE|PRESENTATION|RECORDING/);
});
test('finished audio advances without waiting for the estimated reading duration',()=>{
  const s=setup({voice:true,started:true,ended:true});s.tick(100);s.flush();assert.equal(s.advanced,1);
});
test('slow audio shows captions, cancels late playback and continues with reading time',()=>{
  const s=setup({voice:true,started:false,ended:false});s.tick(100);assert.equal(s.elements.get('tcap').hidden,false);
  s.tick(6001);assert.equal(s.stopped,1);assert.equal(s.T.captionOnly,true);
  s.tick(9102);s.flush();assert.equal(s.advanced,1);
});
test('pause prevents audio timeout and stale step callbacks cannot advance',()=>{
  const s=setup({voice:true,started:false,ended:false});s.T.play=false;s.tick(9000);assert.equal(s.stopped,0);
  const ended=setup({voice:true,started:true,ended:true});ended.tick(100);ended.T.generation++;ended.flush();assert.equal(ended.advanced,0);
});
