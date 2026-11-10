import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/evaluation.js', import.meta.url), 'utf8');
const deck = await readFile(new URL('../assets/evaluation/study-habits.js', import.meta.url), 'utf8');
const flush = async () => { for (let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve)); };
function setup({ analysis, save, permission } = {}) {
  const elements = new Map(), captures = [], analyses = [], saves = [], navigation = [], timers = new Map();
  let now = 0, auth;
  const el = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML:'', textContent:'', checked:false, events:{}, classList:{add(){},remove(){},contains(){return false},toggle(){}},
      addEventListener(name,fn){this.events[name]=fn} });
    return elements.get(id);
  };
  const results = { source:'recorded-evaluation', version:3, contentValidation:{eligible:true}, score:75, metrics:{totalDurationSec:150,wpm:130,fillerCount:3,pauseCount:2}, created_at:'2026-11-10T00:00:00Z' };
  const cloud = { enabled:true,user:{id:'a'},client:{auth:{onAuthStateChange:fn=>auth=fn}},completeEvaluation:async value=>{saves.push(value);return save?save(value):{}},saveNow:async()=>({}) };
  class Capture {
    constructor(){captures.push(this)}
    async start(){if(permission)await permission();this.started=true}
    async finish(){this.finished=true;return new Blob(['recording'])}
    dispose(){this.disposed=true}
  }
  const S={view:'eval',pres:[],ses:[],nid:1}, V={}, B={};
  const podium={snapshot:()=>({}),ext:{S,V,B,PARENT:{},page:(...a)=>a.join(''),sec:(...a)=>a.join(''),esc:String,fmt:String,notify(){},flash(){},toast(){},today:()=> 'Today',
    go:view=>{navigation.push(view);S.view=view;podium.leave()}}};
  const window={PTCloud:cloud,podium,MediaRecorder:class{},PTPracticeAudio:{Capture,analyze:async(...args)=>{analyses.push(args);return analysis?analysis():results}}};
  const context={window,podium,PTCloud:cloud,Blob,AbortController,navigator:{mediaDevices:{getUserMedia(){}}},performance:{now:()=>now},
    setInterval:fn=>{timers.set(1,fn);return 1},clearInterval:id=>timers.delete(id),document:{body:{classList:el('body').classList},getElementById:el,addEventListener(){}}};
  vm.runInNewContext(deck,context);vm.runInNewContext(source,context);B.eval();
  const click=async act=>{el('app').events.click({target:{closest:()=>({dataset:{act}})}});await flush()};
  return {S,el,captures,analyses,saves,navigation,timers,podium,cloud,click,results,time:seconds=>{now=seconds*1000},auth:session=>auth('SIGNED_IN',session)};
}
test('evaluation requires consent and minimum duration; rejected analysis never saves or unlocks',async()=>{
  const s=setup({analysis:()=>{throw Object.assign(new Error('No score was awarded: numbers only.'),{status:422})}});
  await s.click('estart');assert.equal(s.captures.length,0);
  s.el('econsent').checked=true;await s.click('estart');s.time(31);await s.click('efin');
  assert.equal(s.analyses.length,0);assert.match(s.el('enote').textContent,/90 seconds/);
  s.time(150);await s.click('efin');
  assert.equal(s.analyses.length,1);assert.equal(s.analyses[0][5],'evaluation');
  assert.equal(s.saves.length,0);assert.equal(s.S.ev,undefined);assert.equal(s.S.ses.length,0);
  assert.match(s.el('erec').innerHTML,/No score/);assert.doesNotMatch(s.el('erec').innerHTML,/Retry analysis/);
  assert.equal(s.captures[0].disposed,true);assert.equal(s.timers.size,0);
});
test('failed analysis retries the same audio and a failed save never commits a baseline locally',async()=>{
  let failing=true;const s=setup({analysis:()=>{if(failing)throw new Error('Provider unavailable');return s.results},save:()=>({error:'Migration required',retryable:true})});
  s.el('econsent').checked=true;await s.click('estart');s.time(150);await s.click('efin');
  assert.match(s.el('erec').innerHTML,/Retry analysis/);failing=false;await s.click('eanalyze');
  assert.equal(s.captures.length,1);assert.equal(s.analyses[0][0],s.analyses[1][0]);
  assert.equal(s.saves.length,1);assert.equal(s.S.ev,undefined);assert.match(s.el('erec').innerHTML,/Retry saving/);
  s.cloud.completeEvaluation=async value=>{s.saves.push(value);return{}};await s.click('esave');
  assert.equal(s.S.ev.results,s.results);assert.equal(s.S.ses.length,1);assert.equal(s.S.ses[0].fill,3);assert.equal(s.S.ses[0].pau,2);
  assert.equal(s.S.ses[0].source,'recorded-evaluation');assert.equal(s.navigation.at(-1),'evres');
});
test('navigation and account changes cancel pending work without restoring stale results',async()=>{
  for(const action of ['navigate','account']) {
    let resolve;const s=setup({analysis:()=>new Promise(r=>resolve=r)});
    s.el('econsent').checked=true;await s.click('estart');s.time(150);await s.click('efin');
    if(action==='navigate')s.podium.leave();else {s.cloud.user={id:'b'};s.auth({user:{id:'b'}})}
    assert.equal(s.analyses[0][2].aborted,true);resolve(s.results);await flush();
    assert.equal(s.saves.length,0);assert.equal(s.S.ev,undefined);
  }
});
test('late microphone permission is disposed when leaving the evaluation',async()=>{
  let grant;const s=setup({permission:()=>new Promise(r=>grant=r)});
  s.el('econsent').checked=true;await s.click('estart');s.podium.leave();grant();await flush();
  assert.equal(s.captures[0].disposed,true);assert.equal(s.timers.size,0);assert.equal(s.analyses.length,0);
});
