import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { measuredReport, fillerDetails, contentOnlyComments } from '../supabase/functions/_shared/report.js';
const metrics = { wpm:130,totalDurationSec:150,fillerCount:2,fillersPerMin:.8,pauseCount:0,pausesPerMin:0,
  fillers:[{word:'ano',t:null},{word:'ano',t:12}] };

test('saved feedback cannot override recorded metrics or rewrite stored scores', () => {
  const saved = {score:75,metrics,feedback:{strengths:['No filler words.'],improvements:['You said um.']}};
  const before=JSON.stringify(saved),report=measuredReport(saved);
  assert.match(report.feedback.strengths.join(' '),/Only 2 possible filler words/);
  assert.doesNotMatch(JSON.stringify(report.feedback),/You said um|No filler words\./);
  assert.equal(report.score,75);assert.equal(JSON.stringify(saved),before);
});
test('missing details remain unknown and conflicting evidence requires verification', () => {
  assert.match(fillerDetails({fillerCount:2}),/not saved/);
  assert.match(fillerDetails({}),/unavailable/);
  assert.match(fillerDetails({...metrics,fillerCount:0}),/disagree/);
  assert.match(fillerDetails(metrics),/ano × 2/);
});

test('topic feedback is advisory and preserves the measured delivery score', () => {
  const related={score:75,source:'recorded-evaluation',metrics,contentValidation:{eligible:true,topicStatus:'related'}};
  const limited={...related,contentValidation:{eligible:true,topicStatus:'limited_coverage'}};
  assert.equal(measuredReport(related).score,measuredReport(limited).score);
  assert.match(measuredReport(limited).feedback.improvements[0],/limited overlap/);
  assert.match(measuredReport(related).feedback.summary,/vocabulary related/);
});
test('AI slide comments cannot introduce separate filler or pause observations', () => {
  const result=contentOnlyComments({summary:'You used many fillers.',strengths:['Clear example.'],
    improvements:['Reduce um and uh.','Explain the conclusion.'],recommendations:['Avoid long pauses.']});
  assert.deepEqual(result.improvements,['Explain the conclusion.']);
  assert.deepEqual(result.recommendations,[]);assert.deepEqual(result.strengths,['Clear example.']);
  assert.doesNotMatch(result.summary,/many fillers/);
});
test('practice report cards ignore stale copied counts and match their measured feedback', async () => {
  const source=await readFile(new URL('../js/dashboard.js',import.meta.url),'utf8');
  const view=source.slice(source.indexOf('rdet:a=>')+5,source.indexOf('\nperf:')).trim().replace(/,$/,'');
  const saved={id:1,deck:'Talk',d:'Today',dur:150,tg:150,fill:0,pau:9,wpm:40,score:20,
    analysis:{score:75,metrics,quality:{warnings:[]},transcript:'Talk',feedback:{strengths:['No filler words.']}}};
  const context={sesById:()=>saved,V:{},podium:{measuredReport,fillerDetails},esc:String,fmt:String,
    page:(...a)=>a.join(''),sec:(...a)=>a.join(''),tips:x=>Object.values(measuredReport(x.analysis).feedback).filter(Array.isArray).flat()};
  const render=vm.runInNewContext('('+view+')',context),html=render(1);
  assert.match(html,/<h4>Filler Words<\/h4><p class="mv">2<\/p>/);
  assert.match(html,/<h4>Long Pauses<\/h4><p class="mv">0<\/p>/);
  assert.match(html,/Only 2 possible filler words/);assert.match(html,/ano × 2/);
  assert.equal(saved.fill,0,'render must not mutate saved account data');
});
