import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const welcome=await readFile(new URL('../js/welcome-intro.js',import.meta.url),'utf8');
const robot=await readFile(new URL('../js/robot.js',import.meta.url),'utf8');
function setup(reducedMotion=true){
  const elements=new Map(), timers=new Map();let next=0,frame,speech,hushed=0,arrival,waves=0,introductions=0;
  const get=id=>{if(!elements.has(id))elements.set(id,{hidden:true,dataset:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},closest:()=>get('hero'),appendChild(el){el.parentElement=this;}});return elements.get(id);};
  get('bot').animate=(frames,options)=>(arrival={frames,options,cancel(){}});
  const podium={prepareNarration(){},hushNow(){hushed++;},robotPoint(){},robotWelcomeWave(){waves++;},robotReady:()=>true,robotIntroduce(text,done,start){introductions++;speech={text,done,start};}};
  vm.runInNewContext(welcome,{podium,document:{getElementById:get,addEventListener(){},removeEventListener(){},body:get('body')},matchMedia:()=>({matches:reducedMotion}),performance:{now:()=>0},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame(){}});
  podium.welcomeStart();frame();
  return {podium,get,timers,get speech(){return speech;},get hushed(){return hushed;},get arrival(){return arrival;},get waves(){return waves;},get introductions(){return introductions;}};
}

test('slow entrance does not wave early or introduce twice when the fallback fires',()=>{
  const s=setup(false);
  assert.equal(s.get('welcome-stage').dataset.phase,'arriving');
  assert.equal(s.arrival.options.duration,1800);
  assert.equal(s.waves,0);
  assert.equal(s.introductions,0);
  const fallback=[...s.timers.values()][0].fn;
  s.arrival.onfinish();fallback();
  assert.equal(s.introductions,1);
  assert.equal(s.waves,0);
});

test('skipping the entrance prevents a late animation completion from starting speech',()=>{
  const s=setup(false);
  s.get('welcome-skip').onclick();s.arrival.onfinish();
  assert.equal(s.introductions,0);
  assert.equal(s.get('welcome-stage').dataset.phase,'pointing');
});
test('welcome waits for audio, allows slow loading, and points only after playback ends',()=>{
  const s=setup();
  assert.equal(s.get('welcome-stage').dataset.phase,'preparing');
  assert.match(s.get('welcome-intro').textContent,/Welcome to PresentTrack/);
  assert.equal(s.get('leval').hidden,false);
  assert.deepEqual([...s.timers.values()].map(t=>t.ms),[45000]);
  s.speech.start();
  assert.equal(s.get('welcome-stage').dataset.phase,'introducing');
  assert.deepEqual([...s.timers.values()].map(t=>t.ms),[120000]);
  s.speech.done();
  assert.equal(s.get('welcome-stage').dataset.phase,'pointing');
  assert.equal(s.get('leval').hidden,false);
  assert.equal(s.timers.size,0);
});
test('blocked audio offers replay, while skip ignores stale playback callbacks',()=>{
  const failed=setup();failed.speech.done();
  assert.equal(failed.get('welcome-replay').textContent,'Play introduction');
  assert.equal(failed.get('welcome-replay').hidden,false);
  const skipped=setup();skipped.get('welcome-skip').onclick();
  skipped.speech.start();skipped.speech.done();
  assert.equal(skipped.get('welcome-stage').dataset.phase,'pointing');
  assert.equal(skipped.timers.size,0);
});
test('robot stays idle during loading, waves on playback, and rests during buffering',()=>{
  let callbacks,done,later;const states=[];
  const context={podium:{},speaking:true,clearAll(){later=null;},stopVoice(){},set:n=>states.push(n),speak:(text,end,hooks)=>{callbacks=hooks;done=end;},later:fn=>{later=fn;}};
  vm.runInNewContext(robot.slice(robot.indexOf('podium.robotIntroduce='),robot.indexOf('podium.robotPoint=')),context);
  context.podium.robotIntroduce('Hello');assert.deepEqual(states,['idle']);
  callbacks.onstart();assert.equal(states.at(-1),'wave');later();assert.equal(states.at(-1),'talking');
  callbacks.onpause();assert.equal(states.at(-1),'idle');assert.equal(later,null);
  callbacks.onstart();assert.equal(states.at(-1),'talking');
  done();assert.equal(states.at(-1),'idle');
});
