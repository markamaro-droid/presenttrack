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
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css' })[extname(path)] || 'application/octet-stream'); res.end(data);
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
  console.log('Browser connected');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let n=0;n<100;n++){if(await evaluate('document.readyState === "complete" && !!window.PTLearning'))break;await new Promise(r=>setTimeout(r,50));}
  console.log('UI loaded');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const [title,body] of [['Healthy study habits','Plan your time. Take breaks. Review what you learn.'],['Plan your time','Choose one goal and a regular time to study.']]){
    const p=pdf.addPage([960,540]);p.drawRectangle({x:0,y:0,width:960,height:540,color:rgb(.08,.12,.23)});
    p.drawText(title,{x:65,y:365,size:45,font,color:rgb(1,1,1)});p.drawText(body,{x:65,y:265,size:23,font,color:rgb(.7,.8,1)});
  }
  const encoded=Buffer.from(await pdf.save()).toString('base64');
  await evaluate(`(async()=>{
    document.documentElement.classList.add('clay');document.documentElement.dataset.theme='dark';document.querySelector('.shell').hidden=true;document.querySelector('#land').hidden=true;document.querySelector('#app').hidden=false;
    const S=podium.ext.S,user='11111111-1111-4111-8111-111111111111',sample=${JSON.stringify(result())};
    window.fetch=async(url)=>{if(String(url).startsWith('/api/'))throw Error('Recording is offline');return originalFetch(url)};
    window.PTCloud={enabled:false,assessmentDone:true,save(){}};
    Object.assign(S,{u:{name:'Alex',email:'alex@example.test',pic:''},isNew:false,toured:true,booted:true,loading:false,evalRequired:false,pres:[{id:1,t:'Healthy study habits',short:'Healthy study habits',target:180,sp:true,file:{name:'study-habits.pdf',size:2000},context:{text:'Healthy study habits'},date:'Not scheduled',time:'',left:null}],ses:[{id:2,deckId:1,deck:'Healthy study habits',d:'Sample session',dur:120,tg:180,analysis:sample,score:sample.score,wpm:sample.metrics.wpm,fill:sample.metrics.fillerCount,pau:sample.metrics.pauseCount,source:'recorded-audio'}],goals:[],notes:[],nid:20});
    podium.ext.FILES[1]=new File([Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))],'study-habits.pdf',{type:'application/pdf'});
    podium.ext.go('dash');
  })()`.replace('window.fetch=','const originalFetch=window.fetch.bind(window);window.fetch='));
  console.log('Fixture ready');
  await new Promise(r=>setTimeout(r,900));
  const frames=[];
  for(let i=0;i<160;i++){
    if(i%32===0)console.log('Capture frame '+i);
    if(i===32)await evaluate(`document.querySelector('[data-go="decks"]').click()`);
    if(i===48)await evaluate(`document.querySelector('#ut').value='Healthy study habits';document.querySelector('#mainc').scrollTo({top:180,behavior:'smooth'})`);
    if(i===64){await evaluate(`podium.ext.go('prac',1)`);await new Promise(r=>setTimeout(r,1000));}
    if(i===76)await evaluate(`document.querySelector('#pconsent').click();document.querySelector('#vw').scrollIntoView({behavior:'smooth',block:'start'})`);
    if(i===84)await evaluate(`document.querySelector('#vfs').click()`);
    if(i===102)await evaluate(`document.querySelector('#vn').click()`);
    if(i===120)await evaluate(`podium.ext.go('rdet',2)`);
    if(i===140)await evaluate(`document.querySelector('#mainc').scrollTo({top:320,behavior:'smooth'})`);
    if([31,63,119,159].includes(i))console.log(await evaluate('podium.ext.S.view+": "+document.querySelector("#view").innerText.slice(0,180)'));
    frames.push((await call('Page.captureScreenshot',{format:'jpeg',quality:85})).data);
    await new Promise(r=>setTimeout(r,90));
  }
  for(const i of [31,63,119,159])await writeFile(join(tmpdir(),'tour-raw-'+i+'.jpg'),Buffer.from(frames[i],'base64'));
  if(errors.length)throw Error(errors.join('\n'));
  await mkdir(join(root,'assets/tour'),{recursive:true});
  await writeFile(join(root,'assets/tour/product-tour-poster.jpg'),Buffer.from(frames[0],'base64'));
  // Encode captured browser frames, preserving 20 seconds without external codecs.
  await evaluate(`window.tourFrames=${JSON.stringify(frames)};window.tourVideo=null;
    (async()=>{const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;const ctx=canvas.getContext('2d');
      const images=await Promise.all(tourFrames.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src='data:image/jpeg;base64,'+src})));
      const stream=canvas.captureStream(8),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000});
      rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));window.tourVideo=btoa(value);stream.getTracks().forEach(t=>t.stop())};
      ctx.drawImage(images[0],0,0);rec.start();const start=performance.now();for(let i=0;i<images.length;i++){ctx.drawImage(images[i],0,0);await new Promise(r=>setTimeout(r,Math.max(0,start+(i+1)*125-performance.now())))}rec.stop();})();`);
  for(let n=0;n<300&&!await evaluate('!!window.tourVideo');n++)await new Promise(r=>setTimeout(r,100));
  const video=await evaluate('window.tourVideo');assert.ok(video,'Video encoding finished');
  await writeFile(join(root,'assets/tour/product-tour.webm'),Buffer.from(video,'base64'));
  console.log('Recorded 20-second desktop tour; '+Math.round(Buffer.from(video,'base64').length/1024)+' KB.');
}finally{socket?.close();chrome.kill();await new Promise(r=>server.close(r));}
