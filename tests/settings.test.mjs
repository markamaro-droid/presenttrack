import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/settings.js', import.meta.url), 'utf8');
function setup({fail = false} = {}) {
  const elements = new Map(), writes = [], storage = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, { value:'', checked:true, disabled:false, textContent:'', setAttribute(){}, replaceChildren(){}, click(){} }); return elements.get(id); };
  const S = { u: { name: 'Student', email:'student@example.test', pic:'' } }, V={}, B={};
  const PTCloud = { enabled:true, user:{id:'one',email_confirmed_at:'2026-01-01'}, row:{data:{settings:{voice:false}}}, saveNow:async data=>{writes.push(data);return fail?{error:'failed'}:{};}, reset:async()=>({}), client:{auth:{updateUser:async()=>({data:{user:{id:'one'}},error:null})}} };
  const context = { window:{PTCloud}, PTCloud, document:{documentElement:{dataset:{}},getElementById:el,querySelectorAll:()=>[],querySelector:()=>el('identity'),createTextNode:s=>s}, localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:false}),podium:{ ext:{S,V,B,esc:String,ic:()=>'',I:{},renderTop(){},toast(){}}, account(){},snapshot:()=>({ses:[]}),save(){},setVoice(on){this.voiceOn=on;} } };
  vm.runInNewContext(source,context);
  return { ...context, S,V,B,el,writes,storage };
}
test('Settings exposes only working groups and keeps account email out of editable fields',()=>{
  const {V}=setup(), html=V.set();
  for(const name of ['Profile','Account & Security','Appearance','Coaching Preferences','Data & Privacy']) assert.ok(html.includes(name));
  assert.doesNotMatch(html,/prototype-states|Email me practice reminders|type="email"/);
  assert.match(html,/data-settings-theme="system"/); assert.match(html,/Download JSON/);
});
test('sign-in restores own preferences and another account resets them',()=>{
  const {podium,PTCloud,S}=setup();podium.account('student@example.test');
  assert.equal(podium.voiceOn,false); assert.equal(S.u.pic,'');
  PTCloud.row={data:{}};podium.account('second@example.test');assert.equal(podium.voiceOn,true);
  assert.equal(podium.snapshot().settings.voice,true);
});
test('voice save persists a snapshot and restores on sign-in',async()=>{
  const a=setup();a.B.set();a.el('rv').checked=false;await a.el('rv').onchange({target:a.el('rv')});
  assert.equal(a.writes[0].settings.voice,false);assert.equal(a.podium.voiceOn,false);
  a.PTCloud.row={data:a.writes[0]};a.podium.account('student@example.test');assert.equal(a.podium.voiceOn,false);
});
test('failed voice save preserves the previous control and runtime state',async()=>{
  const a=setup({fail:true});a.podium.voiceOn=true;a.B.set();a.el('rv').checked=false;
  await a.el('rv').onchange({target:a.el('rv')});
  assert.equal(a.podium.voiceOn,true);assert.equal(a.el('rv').checked,true);assert.match(a.el('coaching-status').textContent,/Could not save/);
});
test('late save from another account cannot apply voice preference',async()=>{
  const a=setup();a.podium.voiceOn=true;a.B.set();a.el('rv').checked=false;
  a.PTCloud.saveNow=async()=>{a.PTCloud.user={id:'other'};return {};};
  await a.el('rv').onchange({target:a.el('rv')});assert.equal(a.podium.voiceOn,true);
});
test('unsafe or oversized stored pictures are discarded',()=>{
  const a=setup();a.PTCloud.row.data.settings={picture:'https://tracking.example/photo',voice:true};a.podium.account('student@example.test');assert.equal(a.S.u.pic,'');
});
