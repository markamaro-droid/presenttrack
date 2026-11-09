// Run the local dev server first. Provider calls, PDF loading, and capture are
// stubbed; this checks real UI wiring without uploading user data or recording.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'presenttrack-slides-'));
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9224',`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
 let pages;for(let i=0;i<40;i++){try{pages=await(await fetch('http://127.0.0.1:9224/json/list')).json();if(pages.some(p=>p.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,250));}
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:'http://127.0.0.1:3000'});
 for(let i=0;i<80;i++){if(await evaluate('!!window.podium?.ext && !!window.PTPresentationContent && document.readyState==="complete"'))break;await new Promise(r=>setTimeout(r,250));}
 await evaluate(`(()=>{
 const S=podium.ext.S;S.pres=[];S.ses=[];S.notes=[];S.goals=[];S.booted=true;S.loading=false;S.u.name='Preview';S.nid=100;
 document.querySelector('.shell').hidden=true;document.getElementById('app').hidden=false;document.documentElement.classList.add('clay');podium.save=()=>{};
 window.uploads=[];window.PTCloud={enabled:true,user:{id:'preview'},assessmentDone:true,upload:async(path,file)=>{uploads.push({path,name:file.name,bytes:await file.text()});return{}},saveNow:async()=>({}),remove:async()=>({})};
 window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async i=>({getTextContent:async()=>({items:[{str:'Original slide '+i+' research findings'}]}),getViewport:({scale})=>({width:960*scale,height:540*scale}),render:({canvasContext})=>{canvasContext.fillStyle='#fff';canvasContext.fillRect(0,0,960,540);return{promise:Promise.resolve()} }}),destroy:async()=>{}})})};
 window.JSZip={loadAsync:async()=>({files:{'ppt/slides/slide1.xml':{}},file:()=>({async:async()=>'<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:t>Original slide research findings</a:t></a:p></p:sld>'})})};
 const append=document.head.appendChild.bind(document.head);document.head.appendChild=el=>{if(el.src?.includes('/pdf.min.js')||el.src?.includes('/jszip.min.js')){queueMicrotask(()=>el.onload());return el;}return append(el)};
 window.recordStarts=0;PTPracticeAudio.Capture=class{async start(){recordStarts++}pause(){}dispose(){}async finish(){return new Blob(['audio'],{type:'audio/webm'})}};
 window.reviewInputs=[];PTPracticeAudio.analyze=async(blob,target,signal,status,presentation)=>{reviewInputs.push(presentation);return{score:80,metrics:{totalDurationSec:30,wpm:120,fillerCount:2,pauseCount:1},quality:{level:'ok',warnings:[]},feedback:{strengths:['Steady pace.'],improvements:['Reduce fillers.'],recommendations:['Pause after your key finding.']},comments:{summary:'Connect the research finding to your conclusion.',strengths:['Clear finding.'],improvements:['Explain the implication.'],recommendations:['Practice a transition.']},contextStatus:'reviewed',transcript:'Research findings'}};
 const now=performance.now.bind(performance);window.previewShift=0;performance.now=()=>now()+previewShift;
 })()`);
 await evaluate(`podium.ext.go('decks');window.pick=(id,files)=>{const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));const input=document.getElementById(id);input.files=dt.files;input.dispatchEvent(new Event('change'))};pick('f',[new File(['pdf'],'old-selection.pdf')]);pick('f',[new File(['word'],'not-allowed.docx')])`);
 assert.match(await evaluate(`document.getElementById('toast').textContent`),/Rejected: only/);
 await evaluate(`document.getElementById('ut').value='Rejected document';document.getElementById('ua').click()`);
 assert.equal(await evaluate('podium.ext.S.pres.length'),0);assert.equal(await evaluate('uploads.length'),0);
 assert.equal(await evaluate(`document.getElementById('f').files.length`),0);
 assert.equal(await evaluate(`document.getElementById('f').accept`),'.pdf,.pptx');
 for(const name of ['legacy.ppt','report.doc','report.docx','image.png','archive.zip','program.exe']){
   await evaluate(`pick('f',[new File(['rejected'],${JSON.stringify(name)})]);document.getElementById('ua').click()`);
   assert.equal(await evaluate('uploads.length'),0);assert.equal(await evaluate(`document.getElementById('f').files.length`),0);
 }
 await evaluate(`pick('f',[new File(['cancelled'],'cancelled.pptx')]);pick('slide-pdf',[new File(['pdf'],'cancelled.pdf')]);document.getElementById('ut').value='Cancelled draft';document.getElementById('uc').click()`);
 assert.deepEqual(await evaluate(`({title:document.getElementById('ut').value,original:document.getElementById('f').files.length,pdf:document.getElementById('slide-pdf').files.length,hidden:document.getElementById('slide-pdf-field').hidden})`),{title:'',original:0,pdf:0,hidden:true});
 await evaluate(`document.getElementById('ua').click()`);assert.equal(await evaluate('uploads.length'),0);
 await evaluate(`pick('f',[new File(['ORIGINAL POWERPOINT BYTES'],'research.pptx')]);document.getElementById('ut').value='Research';document.getElementById('ua').click()`);
 assert.equal(await evaluate('podium.ext.S.pres.length'),0);
 assert.match(await evaluate(`document.getElementById('toast').textContent`),/Attach a PDF/);
 await evaluate(`pick('slide-pdf',[new File(['ORIGINAL PDF BYTES'],'research.pdf',{type:'application/pdf'})]);document.getElementById('ua').click()`);
 for(let i=0;i<40;i++){if(await evaluate('podium.ext.S.pres.length===1'))break;await new Promise(r=>setTimeout(r,50));}
 assert.deepEqual(await evaluate('uploads.map(x=>x.bytes)'),['ORIGINAL POWERPOINT BYTES','ORIGINAL PDF BYTES']);
 assert.match(await evaluate('podium.ext.S.pres[0].context.text'),/Original slide research findings/);
 const deckId=await evaluate('podium.ext.S.pres[0].id');
 for(const [width,height] of [[1440,900],[390,844]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
  await evaluate(`podium.ext.go('prac',${deckId})`);
  for(let i=0;i<40;i++){if(await evaluate(`!document.getElementById('vfs').disabled`))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evaluate(`document.getElementById('vfs').textContent`),'Start');
  assert.equal(await evaluate(`document.getElementById('pgo')===null`),true);
  const before=await evaluate('recordStarts');
  await evaluate(`document.getElementById('vfs').click()`);assert.equal(await evaluate('recordStarts'),before);
  await evaluate(`document.getElementById('pconsent').checked=true;document.getElementById('vfs').click()`);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await evaluate('recordStarts'),before+1);
  assert.equal(await evaluate(`document.getElementById('vw').classList.contains('fs')`),true);
  assert.equal(await evaluate(`document.getElementById('vc').textContent`),'Slide 1 / 2');
  assert.equal(await evaluate(`document.getElementById('vfin').hidden`),false);
  await evaluate('previewShift+=21000');await new Promise(r=>setTimeout(r,250));
  await evaluate(`document.getElementById('vfin').click()`);
  for(let i=0;i<40;i++){if(await evaluate(`podium.ext.S.view==='rdet'`))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evaluate('podium.ext.S.view'),'rdet');
  assert.match(await evaluate(`document.getElementById('view').textContent`),/Comments on your presentation/);
  assert.match(await evaluate('reviewInputs.at(-1).text'),/Original slide/);
 }
 assert.deepEqual(errors,[]);
 console.log('Passed: PDF/PowerPoint upload restrictions, required companion PDF, original byte preservation, extracted context, Start consent/fullscreen/recording, Finish on first slide, contextual report on desktop and mobile.');
 await call('Browser.close');
}finally{ws?.close();chrome.kill();await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:3});}
