// Local regression check: start tools/dev.mjs first. Uses installed Chrome, no dependencies.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'presenttrack-companion-'));
const chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new','--remote-debugging-port=9223',`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  let pages;
  for(let i=0;i<40;i++){try{pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();if(pages.some(p=>p.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,250));}
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
  const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result?.value;};
  await call('Runtime.enable');await call('Page.enable');
  await call('Page.navigate',{url:'http://127.0.0.1:3000'});
  for(let i=0;i<80;i++){if(await evaluate('document.readyState === "complete" && !!window.PTVoice && !!window.podium?.ext'))break;await new Promise(r=>setTimeout(r,250));}
  await evaluate(`document.querySelector('.shell').hidden=true;document.getElementById('app').hidden=false;document.documentElement.classList.add('clay');podium.ext.S.booted=true;podium.ext.S.loading=false;podium.ext.S.pres=[];podium.ext.S.ses=[];podium.ext.S.notes=[];podium.ext.S.goals=[];podium.ext.go('dash');document.getElementById('bot').hidden=false;document.getElementById('bot').className='app';document.getElementById('bguide').hidden=false;`);
  let count=0;
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,568],[844,390]])for(const theme of ['light','dark']){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.documentElement.dataset.theme='${theme}';PTVoice.open();document.querySelector('.tracy-privacy').open=true;`);
    const result=await evaluate(`(()=>{const p=document.getElementById('tracy-voice'),b=document.getElementById('bot'),c=document.getElementById('tracy-close');p.scrollTop=p.scrollHeight;const r=c.getBoundingClientRect(),pr=p.getBoundingClientRect(),br=b.getBoundingClientRect();return {closeVisible:r.top>=0&&r.bottom<=innerHeight&&c.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),panelFits:pr.left>=0&&pr.right<=innerWidth&&pr.top>=0&&pr.bottom<=innerHeight,botFits:br.left>=0&&br.right<=innerWidth&&br.bottom<=innerHeight,padding:getComputedStyle(b).padding,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
    assert.equal(result.closeVisible,true,JSON.stringify({width,height,theme,result}));assert.equal(result.panelFits,true);assert.equal(result.botFits,true);assert.equal(result.padding,'0px');assert.equal(result.overflow,false);
    await evaluate(`document.getElementById('tracy-close').click();document.getElementById('bc').click()`);
    await new Promise(r=>setTimeout(r,400));
    const bubbles=await evaluate(`Array.from(document.querySelectorAll('.robot-bubble')).filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})`);
    assert.ok(bubbles.every(b=>b.fits&&b.hit),JSON.stringify({width,height,bubbles}));
    await evaluate(`document.getElementById('bc').click();PTVoice.open()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    assert.equal(await evaluate(`document.getElementById('tracy-voice').hidden && document.activeElement.id==='bc'`),true);
    count++;
  }
  assert.deepEqual(errors,[]);console.log(`Passed ${count} viewport/theme combinations: panel bounds, sticky close hit target, bot bounds, bubble hit targets, and Escape focus restoration.`);
  await call('Browser.close');
} finally { ws?.close();chrome.kill();await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:3}); }
