import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/dashboard-entrance.js',import.meta.url),'utf8');
function setup({reduced=false,hidden=false,unsupported=false,broken=false,empty=false}={}){
  const animations=[],listeners=new Map(),timers=new Map();let mounts=0,next=0;
  const document={hidden,activeElement:null};
  const element=name=>({name,hidden:false,inert:false,dataset:{},style:{},setAttribute(){},focus(){document.activeElement=this;},
    animate(frames,options){if(broken)throw Error('unavailable');const a={element:this,frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}});
  const app=element('app'),heading=element('heading'),panels=empty?[]:['welcome','hero','stat','grid'].map(element);
  app.hidden=true;app.querySelectorAll=()=>panels;
  if(unsupported)delete app.animate;
  document.getElementById=()=>app;document.querySelector=()=>heading;
  document.addEventListener=(name,fn)=>listeners.set(name,fn);document.removeEventListener=name=>listeners.delete(name);
  const podium={};
  vm.runInNewContext(source,{podium,document,matchMedia:()=>({matches:reduced}),
    window:{scrollTo(){},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
  return {podium,app,document,heading,panels,animations,listeners,timers,
    start:()=>podium.dashboardEnter(()=>{mounts++;app.hidden=false;}),
    finishTimers(){for(const fn of [...timers.values()])fn();},get mounts(){return mounts;}};
}
function released(s){
  assert.equal(s.podium.dashboardEntering(),false);assert.equal(s.app.dataset.entering,undefined);
  assert.equal(s.app.inert,false);assert.deepEqual(s.app.style,{});
  assert.equal(s.timers.size,0);assert.equal(s.listeners.size,0);
  assert.ok(s.animations.every(a=>a.cancelled));
}
test('dashboard mounts and receives focus immediately; live panels reveal in order without blocking controls',()=>{
  const s=setup();assert.equal(s.start(),true);assert.equal(s.start(),false);
  assert.equal(s.mounts,1);assert.equal(s.app.hidden,false);assert.equal(s.document.activeElement,s.heading);
  assert.equal(s.app.inert,false);assert.equal(s.animations.length,5);
  assert.deepEqual(s.animations.slice(1).map(a=>a.element),s.panels);
  assert.deepEqual(s.animations.slice(1).map(a=>a.options.delay),[0,45,90,135]);
  s.animations.at(-1).onfinish();released(s);assert.equal(s.mounts,1);
});
test('reduced motion, hidden tabs and unsupported or broken animations leave the dashboard usable',()=>{
  for(const options of [{reduced:true},{hidden:true},{unsupported:true},{broken:true},{empty:true}]){
    const s=setup(options);s.start();s.finishTimers();released(s);assert.equal(s.mounts,1);
  }
});
test('interaction, resize, tab hiding and timeout settle the reveal without cancelling the user action',()=>{
  for(const action of ['pointerdown','keydown','wheel','resize','visibilitychange','timeout']){
    const s=setup();s.start();const focus={name:'user-selected-control'};s.document.activeElement=focus;
    if(action==='timeout')s.finishTimers();
    else {if(action==='visibilitychange')s.document.hidden=true;s.listeners.get(action)();}
    released(s);assert.equal(s.document.activeElement,focus);assert.equal(s.mounts,1);
  }
});
test('account cancellation prevents stale completion callbacks from changing focus or navigation',()=>{
  const s=setup();s.start();const focus={name:'other-account'};s.document.activeElement=focus;
  s.podium.dashboardEntranceCancel();s.animations.at(-1).onfinish();s.finishTimers();
  released(s);assert.equal(s.mounts,1);assert.equal(s.document.activeElement,focus);
});
