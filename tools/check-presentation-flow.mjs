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
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:'http://127.0.0.1:3000'});
 for(let i=0;i<80;i++){if(await evaluate('!!window.podium?.ext && !!window.PTPresentationContent && document.readyState==="complete"'))break;await new Promise(r=>setTimeout(r,250));}
 if(process.env.CHECK_LIBRARY_ASSETS)await (await import('./library-flow-check.mjs')).checkLibraryAssets({evaluate,call});
 await evaluate(`(()=>{
 const S=podium.ext.S;S.pres=[];S.ses=[];S.notes=[];S.goals=[];S.booted=true;S.loading=false;S.u.name='Preview';S.nid=100;
 document.querySelector('.shell').hidden=true;document.getElementById('app').hidden=false;document.documentElement.classList.add('clay');podium.save=()=>{};
 window.uploads=[];window.PTCloud={enabled:true,user:{id:'preview'},assessmentDone:true,upload:async(path,file)=>{uploads.push({path,name:file.name,bytes:await file.text()});return{}},saveNow:async()=>({}),remove:async()=>({})};
 window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async i=>({getTextContent:async()=>({items:[{str:'Original slide '+i+' research findings'}]}),getViewport:({scale})=>({width:960*scale,height:540*scale}),render:({canvasContext})=>{canvasContext.fillStyle='#fff';canvasContext.fillRect(0,0,960,540);return{promise:Promise.resolve()} }}),destroy:async()=>{}})})};
 window.JSZip={loadAsync:async()=>({files:{'ppt/slides/slide1.xml':{},'ppt/slides/slide2.xml':{}},file:()=>({async:async()=>'<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:t>Original slide research findings</a:t></a:p></p:sld>'})})};
 const append=document.head.appendChild.bind(document.head);document.head.appendChild=el=>{if(el.src?.includes('/pdf.min.js')||el.src?.includes('/jszip.min.js')){queueMicrotask(()=>el.onload());return el;}return append(el)};
 window.recordStarts=0;PTPracticeAudio.Capture=class{async start(){recordStarts++}pause(){}dispose(){}async finish(){return this.blob ||= new Blob(['audio'],{type:'audio/webm'})}};
 window.reviewInputs=[];PTPracticeAudio.analyze=async(blob,target,signal,status,presentation)=>{reviewInputs.push(presentation);return{score:80,metrics:{totalDurationSec:30,wpm:120,fillerCount:2,fillersPerMin:4,pauseCount:1,pausesPerMin:2,fillers:[{word:'ano',t:null},{word:'hmm',t:null}]},quality:{level:'ok',warnings:[]},feedback:{strengths:['Steady pace.'],improvements:['Reduce fillers.'],recommendations:['Pause after your key finding.']},comments:{summary:'Connect the research finding to your conclusion.',strengths:['Clear finding.'],improvements:['Explain the implication.'],recommendations:['Practice a transition.']},contextStatus:'reviewed',transcript:'Research findings'}};
 const now=performance.now.bind(performance);window.previewShift=0;performance.now=()=>now()+previewShift;
 })()`);
 await evaluate(`podium.ext.go('decks');window.pick=(id,files)=>{const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));const input=document.getElementById(id);input.files=dt.files;input.dispatchEvent(new Event('change'))};pick('f',[new File(['pdf'],'old-selection.pdf')]);pick('f',[new File(['word'],'not-allowed.docx')])`);
 assert.match(await evaluate(`document.getElementById('toast').textContent`),/Rejected: only/);
 await evaluate(`document.getElementById('ut').value='Rejected document';document.getElementById('ua').click()`);
 assert.equal(await evaluate('podium.ext.S.pres.length'),0);assert.equal(await evaluate('uploads.length'),0);
 assert.equal(await evaluate(`document.getElementById('f').files.length`),0);
 if(process.env.BLOCKED_DOCX_PATH){
   const {root}=await call('DOM.getDocument');const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#f'});
   await call('DOM.setFileInputFiles',{nodeId,files:[path.resolve(process.env.BLOCKED_DOCX_PATH)]});
   await evaluate(`document.getElementById('ua').click()`);
   assert.equal(await evaluate('uploads.length'),0);assert.equal(await evaluate('podium.ext.S.pres.length'),0);
   assert.equal(await evaluate(`document.getElementById('f').files.length`),0);
   console.log('Attached DOCX fixture rejected without any upload or presentation record.');
 }
 assert.equal(await evaluate(`document.getElementById('f').accept`),'.pdf,.pptx');
 for(const name of ['legacy.ppt','report.doc','report.docx','image.png','archive.zip','program.exe']){
   await evaluate(`pick('f',[new File(['rejected'],${JSON.stringify(name)})]);document.getElementById('ua').click()`);
   assert.equal(await evaluate('uploads.length'),0);assert.equal(await evaluate(`document.getElementById('f').files.length`),0);
 }
 await evaluate(`pick('f',[new File(['cancelled'],'cancelled.pptx')]);document.getElementById('ut').value='Cancelled draft';document.getElementById('uc').click()`);
 assert.deepEqual(await evaluate(`({title:document.getElementById('ut').value,original:document.getElementById('f').files.length,pickers:document.querySelectorAll('#view input[type=file]').length})`),{title:'',original:0,pickers:1});
 await evaluate(`document.getElementById('ua').click()`);assert.equal(await evaluate('uploads.length'),0);
 await evaluate(`pick('f',[new File(['ORIGINAL POWERPOINT BYTES'],'research.pptx')]);document.getElementById('ut').value='Research';document.getElementById('ua').click()`);
 for(let i=0;i<40;i++){if(await evaluate('podium.ext.S.pres.length===1'))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await evaluate('podium.ext.S.pres.length'),1,'PPTX uploads without a PDF');
 assert.deepEqual(await evaluate('uploads.map(x=>x.bytes)'),['ORIGINAL POWERPOINT BYTES']);
 assert.match(await evaluate('podium.ext.S.pres[0].context.text'),/Original slide research findings/);
 await evaluate(`pick('f',[new File(['ORIGINAL PDF BYTES'],'research.pdf',{type:'application/pdf'})]);document.getElementById('ut').value='PDF Research';document.getElementById('ua').click()`);
 for(let i=0;i<40;i++){if(await evaluate('podium.ext.S.pres.length===2'))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await evaluate('podium.ext.S.pres.length'),2,'PDF is a separate presentation');
 assert.deepEqual(await evaluate('uploads.map(x=>x.bytes)'),['ORIGINAL POWERPOINT BYTES','ORIGINAL PDF BYTES']);
 await evaluate(`podium.ext.go('prac',podium.ext.S.pres[1].id)`);
 for(let i=0;i<40;i++){if(await evaluate(`!!document.querySelector('#vst canvas')`))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await evaluate(`!!document.querySelector('#vst canvas')`),true,'PDF renders original pages');
 const deckId=await evaluate('podium.ext.S.pres[0].id');
 for(const [width,height] of [[1440,900],[390,844]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
  await evaluate(`podium.ext.go('prac',${deckId})`);
  for(let i=0;i<40;i++){if(await evaluate(`!document.getElementById('vfs').disabled`))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evaluate(`document.getElementById('vfs').textContent`),'Start');
  assert.match(await evaluate(`document.getElementById('vst').textContent`),/text preview/);
  assert.equal(await evaluate(`document.querySelectorAll('#vw input[type=file]').length`),0,'PPTX practice never requests another file');
  assert.equal(await evaluate(`document.getElementById('pgo')===null && document.getElementById('pfin')===null`),true);
  const before=await evaluate('recordStarts');
  await evaluate(`document.getElementById('vfs').click()`);assert.equal(await evaluate('recordStarts'),before);
  await evaluate(`document.getElementById('pconsent').checked=true;document.getElementById('vfs').click()`);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await evaluate('recordStarts'),before+1);
  assert.equal(await evaluate(`document.getElementById('vw').classList.contains('fs')`),true);
  assert.equal(await evaluate(`document.getElementById('vc').textContent`),'Slide 1 / 2');
  assert.equal(await evaluate(`document.getElementById('vfin').hidden`),false);
  await evaluate(`document.getElementById('vfs').click()`);
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await evaluate(`document.getElementById('vfin').hidden`),false,'single Finish remains available outside fullscreen');
  await evaluate('previewShift+=21000');await new Promise(r=>setTimeout(r,250));
  await evaluate(`window.reviewBlobs=[];window.originalAnalyze=PTPracticeAudio.analyze;window.failOnce=true;PTPracticeAudio.analyze=async(...args)=>{reviewBlobs.push(args[0]);if(failOnce){failOnce=false;throw Error('Recording analysis limit reached. Keep this page open.')}return originalAnalyze(...args)};document.getElementById('vfin').click()`);
  await new Promise(r=>setTimeout(r,100));
  assert.match(await evaluate(`document.getElementById('vnote').textContent`),/Recording analysis limit reached/);
  assert.equal(await evaluate(`document.getElementById('vfin').textContent`),'Retry analysis');
  assert.equal(await evaluate('podium.ext.S.view'),'prac');
  await evaluate(`document.getElementById('vfin').click()`);
  for(let i=0;i<40;i++){if(await evaluate(`podium.ext.S.view==='rdet' && document.getElementById('view').textContent.includes('Comments on your presentation')`))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evaluate('podium.ext.S.view'),'rdet');
  assert.equal(await evaluate('reviewBlobs.at(-1)===reviewBlobs.at(-2)'),true,'retry reuses retained audio');
  assert.equal(await evaluate('recordStarts'),before+1,'retry does not restart microphone');
  await evaluate(`PTPracticeAudio.analyze=originalAnalyze`);
  assert.match(await evaluate(`document.getElementById('view').textContent`),/Comments on your presentation/);
  assert.match(await evaluate('reviewInputs.at(-1).text'),/Original slide/);
 }
 await evaluate(`podium.ext.S.ses.at(-1).fill=0;podium.ext.S.ses.at(-1).pau=99;podium.ext.go('rdet',podium.ext.S.ses.at(-1).id)`);
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.g-perf .mv')].map(x=>x.textContent)`),['120 WPM','2','1','80%']);
 assert.match(await evaluate(`document.getElementById('view').textContent`),/ano.*hmm/);
 await evaluate(`podium.ext.S.ev={done:true,results:{source:'recorded-evaluation',contentValidation:{eligible:true},score:75,metrics:{wpm:130,totalDurationSec:150,fillerCount:2,fillersPerMin:.8,pauseCount:0,pausesPerMin:0,fillers:[{word:'ano',t:null},{word:'ano',t:12}]},feedback:{strengths:['No filler words.'],improvements:['You said um and uh.'],recommendations:[]}}};podium.ext.go('evres')`);
 assert.match(await evaluate(`document.querySelectorAll('.er-metric')[3].textContent`),/2detected.*ano/);
 assert.match(await evaluate(`document.getElementById('view').textContent`),/Only 2 possible filler words/);
 assert.doesNotMatch(await evaluate(`document.getElementById('view').textContent`),/You said um and uh/);
 console.log('Passed: evaluation and practice cards match measured feedback despite conflicting saved text/count copies; detected words are visible.');
 assert.deepEqual(errors,[]);
 console.log('Passed: PDF/PowerPoint upload restrictions, independent PPTX and PDF uploads and viewers, original byte preservation, extracted context, Start consent/fullscreen/recording, Finish on first slide, contextual report on desktop and mobile.');
 const duplicates=[];
 for(const view of ['dash','decks','perf','prog','hist','coach','goals','ready','pdet','create','note','set','eval','evres']){
  await evaluate(`podium.ext.go('${view}',${deckId})`);
  const repeated=await evaluate(`(()=>{const groups=new Map();for(const b of document.querySelectorAll('#view button[data-go]')){if(!b.getClientRects().length)continue;let route=b.dataset.go;if(route==='up')route='decks';if(route==='weak')route='prac';if(route==='evres')route='eval';const key=route+':'+(route==='eval'?'':b.dataset.a||'');groups.set(key,[...(groups.get(key)||[]),b.textContent.trim()]);}return [...groups].filter(([,labels])=>labels.length>1);})()`);
  if(repeated.length)duplicates.push({view,repeated});
 }
 assert.deepEqual(duplicates,[]);
 console.log('Passed: no duplicate in-page navigation actions across 14 populated app views.');
 await (await import('./library-flow-check.mjs')).checkLibrary({evaluate,call});
 assert.deepEqual(errors,[]);
 await call('Browser.close');
}finally{ws?.close();chrome.kill();await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:3});}
