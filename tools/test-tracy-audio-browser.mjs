// Real browser media decoding and the actual conversation UI; no paid requests.
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const scripts = new Set(['js/tracy-speech.js','js/cartesia-speech.js','js/browser-voice-session.js','js/robot-voice.js']);
let mode = 'credits', speechRequests = 0;
const wav = Buffer.alloc(44 + 12800);
wav.write('RIFF', 0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(12800,40);
const bootstrap = `<script>
window.PTCloud={enabled:true,user:{id:'audio-test'},client:{auth:{getSession:async()=>({data:{session:{access_token:'offline-test',user:{id:'audio-test'}}}}),onAuthStateChange:()=>{}}}};
window.podium={ext:{S:{view:'dash'}}};window.spoken=[];window.audioStates=[];window.blockMedia=false;
const realPlay=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(){return window.blockMedia?Promise.reject(new DOMException('Test autoplay restriction','NotAllowedError')):realPlay.call(this)};
// Headless Chrome has no installed OS voices. Instrument only that external engine.
Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener:()=>{},resume:()=>{},pause:()=>{},cancel(){window.deviceUtterance=null},speak(u){window.deviceUtterance=u;spoken.push(u.text);u.onstart?.()}}});
</script>`;
const server = createServer(async (req,res) => {
  try {
    if(req.url==='/api/coach'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({reply:'Hello, I am ready to help you practice.'}));return;}
    if(req.url==='/api/speech'){speechRequests++;res.setHeader('Content-Type','application/json');res.statusCode=mode==='credits'?503:200;res.end(JSON.stringify(mode==='credits'?{error:'speech_credits'}:{audio:wav.toString('base64'),mime:'audio/wav'}));return;}
    if(req.url==='/'){
      let html=await readFile(join(root,'index.html'),'utf8');
      html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>scripts.has(src)?tag:'').replace(/<link[^>]*>/g,'');
      html=html.replace('<script src="js/tracy-speech.js">',bootstrap+'<script src="js/tracy-speech.js">');
      res.setHeader('Content-Type','text/html');res.end(html);return;
    }
    const asset=req.url.slice(1);
    if(scripts.has(asset)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(join(root,asset)));return;}
    res.writeHead(404).end();
  }catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(join(tmpdir(),'presenttrack-audio-'));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--autoplay-policy=user-gesture-required','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);let output='';chrome.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});chrome.on('error',reject)});
  socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'))},15000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}))});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p)=>send(m,p,sessionId);
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  const wait=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50))}throw Error('Waiting for '+expression)};
  async function load(){await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});await wait('document.readyState==="complete" && !!window.PTVoice');await evaluate(`document.querySelector('.shell').hidden=true;document.querySelector('#bot').hidden=false;PTVoice.open();PTVoice.setHooks({state:s=>audioStates.push(s)});`)}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p})}
  async function ask(text){await evaluate(`document.querySelector('#tracy-input').value=${JSON.stringify(text)}`);await click('#tracy-send')}

  await load();await ask('Hello Tracy');await wait('PTVoice.state==="speaking"');
  assert.equal(await evaluate('spoken.length'),1);assert.match(await evaluate('document.querySelector("#tracy-status").textContent'),/device voice/);
  assert.equal(speechRequests,1);assert.equal(await evaluate('document.querySelector("#tracy-voice").dataset.mic'),'off');
  await evaluate('deviceUtterance.onend()');await wait('!PTVoice.active');
  await ask('Explain my pace');await wait('PTVoice.state==="speaking"');assert.equal(speechRequests,1,'Cooldown avoids another failed generation');
  await click('#tracy-close');assert.equal(await evaluate('deviceUtterance'),null);
  console.log('Credit exhaustion: device fallback, visible source, microphone safety, cooldown and cancellation passed');

  mode='audio';speechRequests=0;await load();await evaluate('window.blockMedia=true');
  await ask('Hello again');await wait('PTVoice.state==="playback"');
  assert.equal(await evaluate('spoken.length'),0,'Autoplay blocking does not change voices');
  assert.equal(speechRequests,1);await evaluate('window.blockMedia=false');await click('#tracy-play');
  await wait('!PTVoice.active');assert.equal(speechRequests,1,'Enable audio reuses the loaded clip');
  assert.ok(await evaluate('audioStates.some(s=>s.state==="speaking")'),'Real audio played and ended');
  console.log('Browser playback: loaded WAV decoded, gesture retry played it, no duplicate synthesis');
}finally{socket?.close();chrome.kill();server.close()}
