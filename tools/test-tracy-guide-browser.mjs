// Real conversation UI + app routes, with offline auth and no paid API calls.
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), visual = process.argv.includes('--visual');
let coachRequests = 0;
const scripts = new Set(['auth','identity','practice-audio','workspace-model','tour-steps','tour-spotlight','dashboard','evaluation','practice-insights','dashboard-home','workspace','settings','robot-menu','browser-voice-session','robot-voice','tracy-guide-plan','tracy-guide']);
if (visual) scripts.add('robot');
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/api/coach') { coachRequests++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ reply: 'Try a short pause.' })); return; }
    const path = req.url === '/' ? '/index.html' : req.url;
    if (!/^\/(index\.html|js\/[\w-]+\.js|css\/[\w-]+\.css|assets\/[\w/.-]+)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, path));
    if (path === '/index.html') data = data.toString().replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => scripts.has(src.replace(/^js\//,'').replace(/\.js$/,'')) || src === 'assets/evaluation/study-habits.js' || visual && (src.includes('three@') || src === 'assets/models/robot-glb.js') ? tag : '').replace(/<link[^>]*href="https:[^>]*>/g, '');
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css' })[extname(path)] || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'presenttrack-guide-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide:true, stdio:['ignore','ignore','pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Chrome startup timed out')), 15000);
    let out = ''; chrome.stderr.on('data', chunk => { out += chunk; const match = out.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match){clearTimeout(timeout);resolve(match[1]);} });
    chrome.on('error', reject);
  });
  socket = new WebSocket(endpoint); await new Promise(r => socket.addEventListener('open', r, {once:true}));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', e => { const msg=JSON.parse(e.data); if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);} });
  const send = (method, params={}, sessionId) => new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(`Timed out: ${method}`));},15000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
  const { targetId } = await send('Target.createTarget',{url:'about:blank'});
  const { sessionId } = await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(method,params)=>send(method,params,sessionId);
  const evaluate = async expression => { const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value; };
  const wait = async expression => { for (let i=0;i<120;i++) { if(await evaluate(expression)) return; await new Promise(r=>setTimeout(r,50)); } throw Error(`Waiting for: ${expression}`); };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const ask = async message => { await evaluate(`PTVoice.open(); document.querySelector('#tracy-input').value=${JSON.stringify(message)};document.querySelector('#tracy-form').requestSubmit();`); };
  const next = () => evaluate(`document.querySelector('[data-guide=next]').click()`);
  for (const [width,height,reduced] of [[1440,900,false],[390,844,false],[320,740,true]]) {
    coachRequests = 0;
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    await wait('document.readyState === "complete" && !!window.PTTracyGuide && !!window.PTVoice');
    await evaluate(`document.documentElement.classList.add('clay');document.documentElement.dataset.theme='dark';document.querySelector('.shell').hidden=true;document.querySelector('#app').hidden=false;document.querySelector('#bot').hidden=false;document.querySelector('#bot').classList.add('app');window.PTCloud={enabled:true,user:{id:'guide-test',app_metadata:{role:'student'}},assessmentDone:true,client:{auth:{getSession:async()=>({data:{session:{user:{id:'guide-test'},access_token:'offline-test'}}})}}};const S=podium.ext.S;S.u={name:'Guide Tester',email:'guide@example.test',pic:''};S.booted=true;S.loading=false;S.evalRequired=false;S.isNew=false;S.ses=[];S.pres=[{id:101,t:'Introduction',short:'Introduction',target:180,file:null}];podium.ext.go('note');window.guideNarrations=[];window.guideRequests=[];window.captureStarts=0;podium.narrate=text=>guideNarrations.push(text);podium.hushNow=()=>{};window.fetch=async(url)=>{guideRequests.push(String(url));return new Response(JSON.stringify({reply:'Try a short pause.'}),{status:200,headers:{'Content-Type':'application/json'}})};PTPracticeAudio.Capture.prototype.start=async()=>{captureStarts++};PTVoice.setSpeaker(false);`);
    if (visual) { await evaluate(`podium.robotShow(true,'app');podium.setVoice(false)`); await wait('podium.robotReady()'); }
    assert.equal(await evaluate('PTTracyGuide.active'),false,'No unsolicited guide');
    await ask('I want to start practice my speaking performance where should I start?');
    await wait(`podium.ext.S.view==='prac' && document.querySelector('#tracy-guide-count').textContent==='Step 1 of 4'`);
    assert.equal(await evaluate('document.querySelector("#tracy-voice").hidden'),true);
    assert.equal(await evaluate('PTVoice.active'),false);
    assert.equal(coachRequests,0);
    const positions=[];
    for (let step=1;step<=4;step++) {
      await pause(850);
      const geometry=await evaluate(`(()=>{const keys=['#tracy-guide','#bot','#tracy-guide-highlight'];return keys.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})})()`);
      const [card,bot,spot]=geometry;
      const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      for(const box of [card,bot]) { assert.ok(box.x>=0 && box.x+box.w<=width+1 && box.y>=0 && box.y+box.h<=height+1,`${width}, step ${step}: offscreen ${JSON.stringify(geometry)}`); }
      assert.equal(overlap(card,bot),0,`${width}: Tracy overlaps the instructions`);
      assert.equal(overlap(card,spot),0,`${width}, step ${step}: instructions cover the target ${JSON.stringify(geometry)}`);
      assert.equal(overlap(bot,spot),0,`${width}, step ${step}: Tracy covers the target`);
      positions.push([bot.x,bot.y]);
      if (visual) { const shot=await call('Page.captureScreenshot',{format:'png'}); await writeFile(join(profile,`guide-${width}-step-${step}.png`),Buffer.from(shot.data,'base64')); }
      assert.equal(await evaluate('document.querySelector("#pconsent").checked'),false);
      assert.equal(await evaluate('captureStarts'),0);
      if(step<4) await next();
    }
    if(width>600) assert.ok(new Set(positions.map(x=>x.join(','))).size>1,'Tracy moves between controls');
    // Actual recording click is left to the user. A missing consent stays unchecked.
    await evaluate(`document.querySelector('#vfs').click()`);
    assert.equal(await evaluate('PTTracyGuide.active'),false);
    assert.equal(await evaluate('captureStarts'),0);
    await evaluate(`document.querySelector('#bc').click()`);
    assert.equal(await evaluate('document.querySelector("#bc").getAttribute("aria-expanded")'),'true','Robot menu reopens on the first click after guidance');
    await ask('Can you guide me to practice?');await wait(`document.querySelector('#tracy-guide-count').textContent==='Step 1 of 4' && PTTracyGuide.active`);
    await evaluate(`podium.ext.go('prog')`);await pause(1400);
    assert.equal(await evaluate('PTTracyGuide.active'),false);assert.equal(await evaluate('podium.ext.S.view'),'prog');
    await ask('How can I improve my pace?');await wait('!PTVoice.active');
    assert.equal(coachRequests,1,'Normal coaching uses the ordinary chat path');
    assert.equal(await evaluate('PTTracyGuide.active'),false);assert.equal(await evaluate('podium.ext.S.view'),'prog');
    await ask('Open my reports');await wait(`podium.ext.S.view==='rep' && document.querySelector('#tracy-guide-count').textContent==='Step 1 of 1'`);
    await evaluate(`document.querySelector('[data-guide=chat]').click()`);
    assert.equal(await evaluate('PTTracyGuide.active'),false);assert.equal(await evaluate('document.querySelector("#tracy-voice").hidden'),false);
    assert.ok(await evaluate('document.querySelectorAll("#tracy-history .tracy-message").length >= 8'),'History survives guidance');
    await evaluate(`podium.ext.S.pres=[];podium.ext.go('dash')`);await ask('Help me start practice');
    await wait(`document.querySelector('#tracy-guide-title').textContent==='Add your first presentation'`);
    assert.equal(await evaluate('podium.ext.S.view'),'decks');
    await evaluate(`PTTracyGuide.stop();PTCloud.assessmentDone=false;podium.ext.go('dash')`);await ask('Help me start practice');
    await wait(`podium.ext.S.view==='eval'`);assert.equal(await evaluate('captureStarts'),0);
    await evaluate(`PTTracyGuide.stop();PTCloud.assessmentDone=true;podium.ext.go('dash')`);
    await ask('Open my reports');await evaluate('PTCloud.user.id="another-account"');await pause(1100);
    assert.equal(await evaluate('PTTracyGuide.active'),false);assert.equal(await evaluate('podium.ext.S.view'),'dash');
    console.log(`${width}×${height}: requested guidance, real navigation, placement, consent, cancellation, history and account isolation passed`);
  }
  console.log(visual ? `Screenshots: ${profile}` : 'Tracy browser checks passed.');
} finally { socket?.close();chrome.kill();server.close(); }
