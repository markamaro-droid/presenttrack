// Offline browser regression: real app views, no cloud accounts or speech requests.
// Run with CHROME_PATH set if Chrome is installed elsewhere.
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const scripts = new Set(['auth','practice-audio','workspace-model','tour-steps','tour-spotlight','dashboard','assessment','evaluation','practice-insights','dashboard-home','workspace','settings','robot-menu']);
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url;
    if (!/^\/(index\.html|js\/[\w-]+\.js|css\/[\w-]+\.css|assets\/[\w/.-]+)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, path));
    if (path === '/index.html') data = data.toString().replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => scripts.has(src.replace(/^js\//,'').replace(/\.js$/,'')) || src === 'assets/evaluation/study-habits.js' ? tag : '').replace(/<link[^>]*href="https:[^>]*>/g, '');
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css' })[extname(path)] || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'presenttrack-tour-'));
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
  for (const [width,height] of [[1440,900],[390,844]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let n=0;n<100;n++){if(await evaluate('document.readyState === "complete" && !!window.PTTourSpotlight && !!window.podium?.ext && podium.ext.V.set.toString().includes("settings-profile-form") && !!document.querySelector("#tour")'))break;await new Promise(r=>setTimeout(r,50));}
    await evaluate(`document.documentElement.classList.add('clay');document.querySelector('#app').hidden=false;document.querySelector('#bot').hidden=false;window.PTCloud={enabled:false};const S=podium.ext.S;S.u={name:'Tour Tester',email:'tour@example.test',pic:''};S.booted=true;S.loading=false;S.evalRequired=false;S.ses=[1,2].map(i=>({id:i,deckId:1,deck:'Test',at:new Date().toISOString(),d:'Today',dur:120,wpm:130,fill:2,pau:1,score:80,analysis:{}}));podium.ext.go('dash');`);
    // Every configured selector resolves in a populated account, using actual views.
    const missing = await evaluate(`(()=>{const missing=[];for(const step of PTTourSteps){podium.ext.go(step.view);const el=document.querySelector(step.target);if(!el||el.getBoundingClientRect().width<2)missing.push(step.title+' '+step.target);}return missing;})()`);
    assert.deepEqual(missing, [], `${width}: missing targets`);
    await evaluate(`podium.ext.go('dash');podium.startTour();podium.tourPause();`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#spot')).position`),'fixed');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#spot>b')).position`),'fixed');
    // Scroll on successive frames and assert alignment even while narration is paused.
    const errors = await evaluate(`(async()=>{const main=document.querySelector('#mainc'),target=document.querySelector('.dh-hero'),spot=document.querySelector('#spot');const errors=[];for(let i=0;i<12;i++){main.scrollTop=i*3;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);if(!spot.hidden)errors.push(Math.abs(spot.getBoundingClientRect().top-(target.getBoundingClientRect().top-8)));}target.style.height='420px';await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);errors.push(Math.abs(spot.getBoundingClientRect().height-target.getBoundingClientRect().height-16));return errors;})()`);
    assert.ok(errors.length>0 && errors.every(e=>e<1), `${width}: drift ${errors}`);
    await evaluate(`document.querySelector('[data-tact="tnext"]').click();podium.tourPause();document.querySelector('[data-tact="tprev"]').click();podium.tourPause();podium.ext.render();`);
    await evaluate('new Promise(requestAnimationFrame)');
    assert.equal(await evaluate(`document.querySelector('#spot').hidden`),false);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('#spot>b').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()`),true);
    await evaluate('podium.tourStop()');
    assert.equal(await evaluate(`document.querySelector('#spot').hidden`),true);
    // New users: gated controls are skipped, not relabeled as sidebar features.
    await evaluate(`podium.ext.S.evalRequired=true;podium.ext.S.pres=[];podium.ext.S.ses=[];podium.ext.go('dash');podium.startTour();`);
    const gated = await evaluate(`(()=>{const visited=[];for(let i=0;i<PTTourSteps.length+2&&podium.tourOn();i++){visited.push(document.querySelector('#spot strong')?.textContent);document.querySelector('[data-tact="tnext"]').click();}return {visited,on:podium.tourOn(),hidden:document.querySelector('#spot').hidden};})()`);
    assert.equal(gated.on,false);assert.equal(gated.hidden,true);assert.ok(!gated.visited.includes('Start'));
    console.log(`PASS ${width}x${height}: all selectors, scrolling, resizing, replacement, navigation, tooltip bounds, gated steps and cleanup`);
  }
} finally { socket?.close(); chrome.kill(); server.close(); }

