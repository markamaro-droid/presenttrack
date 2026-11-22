// Record the actual desktop UI using isolated sample data. No cloud or AI calls.
// Run with CHROME_PATH set if Chrome is installed elsewhere.
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {pdfAsset,pdfRoot} from './pdf-assets.mjs';
import {result} from '../tests/fixtures/learning.mjs';

const root = resolve(import.meta.dirname, '..');
const scripts = new Set(['auth','practice-audio','workspace-model','tour-steps','tour-spotlight','dashboard','evaluation','practice-insights','dashboard-home','workspace','settings','robot-menu','learning-metrics','learning','pdf-viewer','presentation-content']);
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url;
    const pm=pdfAsset.exec(path.slice(1));if(pm){res.setHeader('Content-Type',path.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await readFile(join(pdfRoot,pm[1])));return;}
    if (!/^\/(index\.html|js\/[\w-]+\.js|css\/[\w-]+\.css|assets\/[\w/.-]+|supabase\/functions\/_shared\/[\w.-]+\.js)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, path));
    if (path === '/index.html') data = data.toString().replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => scripts.has(src.replace(/^js\//,'').replace(/\.js$/,'')) || src === 'assets/evaluation/study-habits.js' ? tag : '').replace(/<link[^>]*href="https:[^>]*>/g, '');
    res.setHeader('Content-Type', ({ '.webm':'video/webm','.vtt':'text/vtt','.html':'text/html', '.js':'text/javascript', '.css':'text/css' })[extname(path)] || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'presenttrack-learning-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--no-first-run','--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide:true, stdio:['ignore','ignore','pipe'] });
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
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await evaluate(`document.querySelector('.shell').hidden=false;document.querySelector('#app').hidden=true;document.querySelector('#land').hidden=true;document.documentElement.classList.add('clay');document.documentElement.dataset.theme='dark';`);
  const initial=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'presenttrack-tour-login.png'),Buffer.from(initial.data,'base64'));
  console.log(await evaluate(`(async()=>{const v=document.querySelector('#product-tour');v.load();await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(Error('Cannot play video'))});return {duration:v.duration,width:v.videoWidth,height:v.videoHeight}})()`));
  await evaluate(`document.body.innerHTML='<video id="review" muted style="width:100vw;height:100vh" src="assets/tour/product-tour.webm"></video>';document.body.style.margin='0';window.reviewReady=(async()=>{const v=document.querySelector('#review');v.src=URL.createObjectURL(await (await fetch('assets/tour/product-tour.webm')).blob());await new Promise(ok=>v.onloadeddata=ok)})();`);
  await evaluate('window.reviewReady');
  for(const t of [10,14,18]){
    await evaluate(`(async()=>{const v=document.querySelector('#review');v.currentTime=${t};await new Promise(ok=>v.onseeked=ok)})()`);
    await new Promise(r=>setTimeout(r,300));
    assert.ok(Math.abs(await evaluate('document.querySelector("#review").currentTime')-t)<0.2,'Seek reaches requested frame');
    const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'presenttrack-tour-'+t+'.png'),Buffer.from(shot.data,'base64'));
  }
  console.log('Video decoded and sampled at 10, 14, 18 seconds. Screenshots in '+tmpdir());
}finally{socket?.close();chrome.kill();await new Promise(r=>server.close(r));}
