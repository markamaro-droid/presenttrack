import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/dashboard-home.js',import.meta.url),'utf8');
function setup(required=false){
  const S={u:{name:'Test <User>'},ses:[],pres:[],notes:[]},V={dash:()=>'<loading>'};
  const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  vm.runInNewContext(source,{podium:{ext:{S,V,esc,fmt:n=>`${Math.floor(n/60)}:${String(Math.round(n%60)).padStart(2,'0')}`,ic:()=>'<svg></svg>',I:{},pendingEval:()=>required}}});
  return{S,V};
}
test('new users get evaluation next action and no fabricated progress chart',()=>{
  const {V}=setup(true);const html=V.dash();
  assert.match(html,/Start evaluation/);assert.match(html,/aria-current="step"/);assert.doesNotMatch(html,/class="dh-chart"/);assert.match(html,/Appears after your first rehearsal/);
});
test('baseline-only dashboard shows measured baseline instead of repeating empty practice panels',()=>{
  const {S,V}=setup();S.ev={results:{metrics:{words:253,totalDurationSec:148,fillerCount:1}}};S.ses=[{assess:true,deck:'Initial Evaluation',dur:148,d:'Today',score:75}];
  const html=V.dash();assert.match(html,/Baseline recorded/);assert.match(html,/103<small> WPM/);assert.match(html,/Add your presentation/);assert.doesNotMatch(html,/class="dh-chart"/);
});
test('practice dashboard charts analyzed sessions only and escapes presentation text',()=>{
  const {S,V}=setup();S.pres=[{id:1,t:'<unsafe>',target:120,ppt:true,sp:true}];
  S.ses=[{deck:'Old',score:99,dur:60},{id:2,deckId:1,deck:'<unsafe>',score:62,d:'Today',dur:120,analysis:{feedback:{recommendations:['Use <examples>']}}}];
  const html=V.dash();assert.match(html,/Scores for the last 1 analyzed sessions/);assert.match(html,/&lt;unsafe>/);assert.match(html,/Use &lt;examples>/);assert.doesNotMatch(html,/>99%/);assert.match(html,/data-go="ready"/);
});
