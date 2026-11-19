// Offline browser regression: real app views, no cloud accounts or speech requests.
// Run with CHROME_PATH set if Chrome is installed elsewhere.
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {result} from '../tests/fixtures/learning.mjs';

const root = resolve(import.meta.dirname, '..');
const scripts = new Set(['auth','practice-audio','workspace-model','tour-steps','tour-spotlight','dashboard','evaluation','practice-insights','dashboard-home','workspace','settings','robot-menu','learning-metrics','learning']);
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url;
    if (!/^\/(index\.html|js\/[\w-]+\.js|css\/[\w-]+\.css|assets\/[\w/.-]+|supabase\/functions\/_shared\/[\w.-]+\.js)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, path));
    if (path === '/index.html') data = data.toString().replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => scripts.has(src.replace(/^js\//,'').replace(/\.js$/,'')) || src === 'assets/evaluation/study-habits.js' ? tag : '').replace(/<link[^>]*href="https:[^>]*>/g, '');
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css' })[extname(path)] || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'presenttrack-learning-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide:true, stdio:['ignore','ignore','pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Chrome startup timed out')), 15000);
    let out = ''; chrome.stderr.on('data', chunk => { out += chunk; const match = out.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match){clearTimeout(timeout);resolve(match[1]);} });
    chrome.on('error', reject);
  });
  socket = new WebSocket(endpoint); await new Promise(r => socket.addEventListener('open', r, {once:true}));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', e => { const msg=JSON.parse(e.data); if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);} });
  const send = (method, params={}, sessionId) => new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
  const { targetId } = await send('Target.createTarget',{url:'about:blank'});
  const { sessionId } = await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(method,params)=>send(method,params,sessionId);
  const evaluate = async expression => { const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value; };
  const errors=[];socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+m.params.exceptionDetails.exception?.description)});
  await call('Runtime.enable');
  for(const [width,height] of [[1440,900],[390,844]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let n=0;n<100;n++){if(await evaluate('document.readyState === "complete" && !!window.PTLearning'))break;await new Promise(r=>setTimeout(r,50));}
    await evaluate(`(async()=>{
      document.documentElement.classList.add('clay');document.querySelector('.shell').hidden=true;document.querySelector('#land').hidden=true;document.querySelector('#app').hidden=false;
      const sample=${JSON.stringify(result())},S=podium.ext.S,user='11111111-1111-4111-8111-111111111111';
      window.learningFixture={rows:[0,1,2].map(i=>({id:'22222222-2222-4222-8222-'+String(i+1).padStart(12,'0'),user_id:user,kind:i?'practice':'baseline',title:i===2?'Second topic':'Study habits',created_at:new Date(Date.now()-(3-i)*86400000).toISOString(),result:{...sample,source:i?'recorded-audio':'recorded-evaluation',explanationQuality:{...sample.explanationQuality,summary:i===2?'Selected second topic':'Original study topic'}}})),memories:[],conversations:[],preferences:{conversation_history:false,retention_days:30,pause_threshold:2,coaching_style:'Supportive'}};
      const f=learningFixture,nativeFetch=fetch;window.fetch=async(url,options)=>{if(url!=='/api/learning')return nativeFetch(url,options);const input=JSON.parse(options.body);let response={};if(input.action==='history')response={sessions:f.rows,deleted:[]};if(input.action==='memory')response={preferences:f.preferences,memories:f.memories,conversations:f.conversations};if(input.action==='preferences')f.preferences=input.preferences;if(input.action==='save-memory'){const old=f.memories.find(m=>m.id===input.id);if(old)old.content=input.content;else f.memories.push({id:'33333333-3333-4333-8333-333333333333',content:input.content})}if(input.action==='delete-memory')f.memories=f.memories.filter(m=>m.id!==input.id);return Response.json(response)};
      window.PTPresentations={restore:async()=>false};window.PTCloud={enabled:true,user:{id:user},assessmentDone:true,save(){},client:{auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'test'}}})}}};
      Object.assign(S,{u:{name:'Learning Tester',email:'learning@example.test',pic:''},booted:true,loading:false,evalRequired:false,pres:[],ses:[],goals:[],notes:[],nid:20});
      await podium.loadMeasuredReport();await PTLearning.refresh();podium.ext.go('rdet',S.ses[1].id);
    })()`);
    assert.equal(await evaluate(`document.querySelector('.learning-report').textContent.includes('Speaking Delivery')&&document.querySelector('.learning-report').textContent.includes('Explanation Quality')`),true);
    assert.equal(await evaluate(`document.querySelector('.learning-report').textContent.includes('Change from baseline')`),true);
    const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`presenttrack-learning-${width}.png`),Buffer.from(shot.data,'base64'));
    await evaluate(`document.querySelector('[data-learning-goal]').click();podium.ext.go('goals')`);
    assert.equal(await evaluate(`podium.ext.S.goals.length`),1);
    assert.equal(await evaluate(`PTWorkspaceModel.goal(podium.ext.S.goals[0],podium.ext.S.ses).actual`),null,'existing attempts must not complete a newly adopted goal');
    await evaluate(`podium.ext.S.compareB=String(podium.ext.S.ses[1].id);podium.ext.go('perf')`);
    assert.equal(await evaluate(`document.querySelector('.learning-panel').textContent.includes('Original study topic')`),true);
    await evaluate(`document.getElementById('ws-b').value=String(podium.ext.S.ses[2].id);document.getElementById('ws-b').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`document.querySelector('.learning-panel').textContent.includes('Selected second topic')`),true);
    await evaluate(`podium.ext.S.ses[2].assess=true;podium.ext.S.ses[2].analysis.sessionKind='reassessment';podium.ext.go('rdet',podium.ext.S.ses[2].id)`);
    assert.equal(await evaluate(`document.querySelector('#mainc').textContent.includes('Original baseline reference')`),false,'reassessment must not render original baseline scores');
    assert.equal(await evaluate(`document.querySelector('.learning-report').textContent.includes('Selected second topic')`),true);
    await evaluate(`podium.ext.S.ses[2].assess=false`);
    await evaluate(`podium.ext.go('prog')`);
    assert.equal(await evaluate(`!!document.getElementById('ws-preview')`),false);
    assert.equal(await evaluate(`document.querySelectorAll('.learning-charts').length`),2);
    assert.equal(await evaluate(`document.querySelector('.learning-panel').textContent.includes('Insufficient Data')`),true);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true,`${width}: page overflow`);
    await evaluate(`podium.ext.go('set');document.getElementById('load-memory').click()`);
    for(let n=0;n<50&&!await evaluate(`!!document.getElementById('approve-memory')`);n++)await new Promise(r=>setTimeout(r,30));
    await evaluate(`document.getElementById('new-memory').value='Help connect programming examples';document.getElementById('approve-memory').click()`);
    for(let n=0;n<50&&!await evaluate(`!!document.querySelector('[data-memory-edit]')`);n++)await new Promise(r=>setTimeout(r,30));
    assert.equal(await evaluate(`learningFixture.memories[0].content`),'Help connect programming examples');
    await evaluate(`document.querySelector('[data-memory-delete]').click()`);
    for(let n=0;n<50&&await evaluate(`!!document.querySelector('[data-memory-edit]')`);n++)await new Promise(r=>setTimeout(r,30));
    assert.equal(await evaluate(`learningFixture.memories.length`),0);
    await evaluate(`(async()=>{podium.ext.S.ses=[];await PTLearning.refresh()})()`);
    assert.equal(await evaluate(`podium.ext.S.ses.length`),3,'canonical history restores after local state loss');
    assert.equal(await evaluate(`podium.ext.S.ev.results.explanationQuality.summary`),'Original study topic');
    await evaluate(`PTCloud.row={data:podium.snapshot(),onboarded:true};podium.newUser=false;podium.enter('Returning Student','returning@example.test')`);
    for(let n=0;n<80&&await evaluate(`document.getElementById('app').hidden||!document.getElementById('wipe').hidden`);n++)await new Promise(r=>setTimeout(r,40));
    assert.equal(await evaluate(`podium.ext.S.view`),'dash','returning completed users go directly to dashboard');
    await evaluate(`learningFixture.rows=[];PTCloud.row=null;PTCloud.assessmentDone=false;podium.newUser=true;podium.enter('New Student','new@example.test')`);
    for(let n=0;n<80&&!await evaluate(`!!document.getElementById('leval')`);n++)await new Promise(r=>setTimeout(r,40));
    await evaluate(`document.getElementById('leval').click()`);
    for(let n=0;n<80&&await evaluate(`podium.ext.S.view!=='eval'`);n++)await new Promise(r=>setTimeout(r,40));
    assert.equal(await evaluate(`podium.ext.S.view`),'eval','new user must start with baseline evaluation');
    console.log(`PASS ${width}x${height}: separate reports, comparisons, goal adoption, selected-session feedback, real history charts, memory CRUD and restore`);
  }
  assert.deepEqual(errors,[],'browser runtime errors');
} finally { socket?.close(); chrome.kill(); server.close(); }
