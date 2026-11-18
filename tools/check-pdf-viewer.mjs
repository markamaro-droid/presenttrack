// Local browser integration: real files/PDF.js, simulated private storage/jobs.
// Run `npm run dev` first. No live account, conversion or AI requests are made.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'presenttrack-pdf-'));
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9225',`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let pages;for(let i=0;i<60;i++){try{pages=await(await fetch('http://127.0.0.1:9225/json/list')).json();if(pages.some(p=>p.type==='page'))break}catch{}await delay(250)}
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id)}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)};
  const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,message=>message.error?reject(Error(message.error.message)):resolve(message.result));ws.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value};
  const run=(fn,args)=>evaluate(`(${fn.toString()})(${JSON.stringify(args)??''})`);
  const until=async expression=>{for(let i=0;i<220;i++){if(await evaluate(expression))return;await delay(100)}throw Error('Timed out: '+expression)};
  await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:'http://127.0.0.1:3000'});
  await until('!!window.podium?.ext && !!window.PTPresentations && document.readyState==="complete"');
  await run(async()=>{
    window.fixtureFiles={};
    for(const type of ['pdf','pptx'])fixtureFiles[type]=new File([await(await fetch('/assets/library/confident-introductions.'+type)).blob()],'introduction.'+type);
    window.fixtureRows=new Map();window.fixtureStorage=new Map();window.fixtureCalls=[];window.fixtureReady=false;
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(url,options)=>{
      if(url==='/api/presentations'){
        const body=JSON.parse(options.body);fixtureCalls.push(body);
        if(body.action==='usage')return Response.json({usage:{dailyLimit:10,spent:0,reserved:0,available:10}});
        let row=fixtureRows.get(body.id);
        if(body.action==='create'){
          row||={id:body.id,title:body.title,original_filename:body.filename,original_file_path:PTCloud.user.id+'/'+body.id+'.'+body.type,file_type:body.type,file_size:body.size,upload_completed:false,conversion_status:'queued',created_at:new Date().toISOString(),available_at:new Date().toISOString(),conversion_consent_at:body.cloudconvertConsent?new Date().toISOString():null,warnings:[],manual_retries:0};
          fixtureRows.set(row.id,row);
        }
        if(body.action==='list')return Response.json({presentations:[...fixtureRows.values()]});
        if(body.action==='submit'){row.upload_completed=true;row.conversion_status='queued'}
        if(body.action==='retry'){row.conversion_status='queued';row.manual_retries++}
        if(body.action==='status'&&fixtureReady){row.conversion_status='completed';row.total_slides=row.file_type==='pdf'&&row.original_filename==='portrait.pdf'?1:5}
        if(body.action==='download'){
          const file=body.kind==='original'||row.file_type==='pdf'?fixtureStorage.get(row.original_file_path):fixtureFiles.pdf;
          return Response.json({url:URL.createObjectURL(file),filename:body.kind==='preview'?row.original_filename.replace(/\.pptx$/i,'.pdf'):row.original_filename});
        }
        if(body.action==='delete'){fixtureRows.delete(body.id);return Response.json({deleted:true})}
        return Response.json({presentation:row});
      }
      if(typeof url==='string'&&/^https?:/.test(url)&&!url.startsWith(location.origin))throw Error('External requests disabled in fixture');
      return originalFetch(url,options);
    };
    window.PTCloud={enabled:true,user:{id:'11111111-1111-4111-8111-111111111111'},assessmentDone:true,save(){},saveNow:async()=>({}),client:{
      auth:{getSession:async()=>({data:{session:{user:PTCloud.user,access_token:'fixture'}}})},
      storage:{from:bucket=>({upload:async(path,file)=>{if(bucket!=='presentation-originals')throw Error('wrong bucket');fixtureStorage.set(path,file);return {}}})}
    }};
    const S=podium.ext.S;Object.assign(S,{pres:[],ses:[],notes:[],goals:[],nid:100,booted:true,loading:false});S.u.name='PDF Test';
    document.querySelector('.shell').hidden=true;document.getElementById('app').hidden=false;document.documentElement.classList.add('clay');podium.save=()=>{};
    window.pick=type=>{const dt=new DataTransfer();dt.items.add(fixtureFiles[type]);const input=document.getElementById('f');input.files=dt.files;input.dispatchEvent(new Event('change'));document.getElementById('ut').value=type==='pptx'?'PowerPoint test':'PDF test'};
    podium.ext.go('decks');
  });
  await evaluate(`pick('pptx');document.getElementById('ua').click()`);
  assert.equal(await evaluate('fixtureRows.size'),0,'no upload or external processing before consent');
  await evaluate(`document.getElementById('uconvert').checked=true;document.getElementById('ua').click()`);
  await until('podium.ext.S.pres.length===1 && !podium.ext.S.uploading');
  assert.equal(await evaluate('fixtureStorage.values().next().value===fixtureFiles.pptx'),true,'unchanged original is uploaded');
  await evaluate(`podium.ext.go('prac',podium.ext.S.pres[0].id)`);
  await until(`document.getElementById('vst').textContent.includes('queued')`);
  assert.equal(await evaluate(`document.getElementById('vfs').disabled`),true);
  await evaluate(`Object.assign(fixtureRows.values().next().value,{conversion_status:'failed',conversion_error:'Temporary conversion interruption',retryable:true});podium.ext.go('prac',podium.ext.S.pres[0].id)`);
  await until(`document.querySelector('#vst button')?.textContent==='Retry preview'`);
  // A preview can fail after fullscreen was entered. Its exit must still work.
  await evaluate(`document.getElementById('vw').classList.add('fs','fsx');document.body.classList.add('vfsx');document.dispatchEvent(new Event('fullscreenchange'))`);
  assert.equal(await evaluate(`document.getElementById('vpreviewfs').disabled`),false,'failed previews must keep the fullscreen exit available');
  assert.equal(await evaluate(`document.getElementById('vpreviewfs').textContent`),'Exit full screen');
  await evaluate(`document.getElementById('vpreviewfs').click()`);
  assert.equal(await evaluate(`document.getElementById('vw').classList.contains('fs')`),false);
  await evaluate(`document.querySelector('#vst button').click()`);
  await until(`document.getElementById('vst').textContent.includes('queued')`);
  assert.equal(await evaluate('fixtureRows.values().next().value.manual_retries'),1);
  await evaluate(`fixtureReady=true;fixtureRows.values().next().value.warnings=['Some fonts may be substituted.']`);
  await until(`!!document.querySelector('#vst canvas')`);
  await until(`!!podium.ext.S.pres[0].context?.text`);
  assert.match(await evaluate(`document.querySelector('.presentation-warning').textContent`),/fonts/);
  assert.equal(await evaluate(`document.getElementById('vc').textContent`),'Slide 1 / 5');
  assert.ok((await evaluate('podium.ext.S.pres[0].context.text')).length>100);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);
  await until(`document.querySelector('#vst canvas')?.getAttribute('aria-label')==='Slide 5 of 5'`);
  assert.equal(await evaluate(`document.getElementById('vn').disabled`),true);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
  await until(`document.querySelector('#vst canvas')?.getAttribute('aria-label')==='Slide 1 of 5'`);
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:width<900});
    await delay(400);
    await evaluate(`document.getElementById('vpreviewfs').click()`);await delay(350);
    assert.equal(await evaluate(`document.getElementById('vpr').hidden&&document.getElementById('vfin').hidden`),true,'preview alone has no pause or finish action');
    const fit=await run(()=>{const c=document.querySelector('#vst canvas'),b=c.getBoundingClientRect(),h=document.getElementById('vst').getBoundingClientRect();return {ratio:b.width/b.height,pixels:c.width/c.height,fits:b.left>=h.left-1&&b.right<=h.right+1&&b.top>=h.top-1&&b.bottom<=h.bottom+1,width:b.width,height:b.height,host:[h.width,h.height],overflow:document.getElementById('vw').scrollWidth>innerWidth+1}});
    assert.equal(fit.fits,true,JSON.stringify({width,height,...fit}));assert.equal(fit.overflow,false);assert.ok(Math.abs(fit.ratio-16/9)<.01);assert.ok(Math.abs(fit.pixels-fit.ratio)<.01);
    if(width===1440){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(tmpdir(),'presenttrack-pdf-viewer.png'),Buffer.from(shot.data,'base64'))}
    await evaluate(`document.getElementById('vpreviewfs').click()`);await delay(100);
  }
  await evaluate(`podium.ext.go('decks');pick('pdf');document.getElementById('ua').click()`);
  await until('podium.ext.S.pres.length===2&&!podium.ext.S.uploading');
  await evaluate(`delete podium.ext.FILES[podium.ext.S.pres[1].id];podium.ext.go('prac',podium.ext.S.pres[1].id)`);
  await until(`!!document.querySelector('#vst canvas')`);
  const original=await evaluate(`(async()=>{const p=podium.ext.S.pres[1],f=await PTPresentations.file(p,'preview');return {a:Array.from(new Uint8Array(await f.arrayBuffer())),b:Array.from(new Uint8Array(await fixtureFiles.pdf.arrayBuffer()))}})()`);
  assert.deepEqual(original.a,original.b,'uploaded PDF preview uses the original bytes');
  // A minimal actual portrait PDF with vector content and a conventional xref.
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>'];
  const content='0.05 0.2 0.8 rg 0 0 595 842 re f\n1 0.8 0 rg 20 20 555 802 re S\n';objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`});const xref=pdf.length;pdf+=`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await run(bytes=>{fixtureFiles.pdf=new File([bytes],'portrait.pdf',{type:'application/pdf'});podium.ext.go('decks');pick('pdf');document.getElementById('ua').click()},pdf);
  await until('podium.ext.S.pres.length===3&&!podium.ext.S.uploading');
  await evaluate(`podium.ext.go('prac',podium.ext.S.pres[2].id)`);await until(`!!document.querySelector('#vst canvas')`);
  await evaluate(`document.getElementById('vpreviewfs').click()`);await delay(400);
  assert.ok(await run(()=>{const b=document.querySelector('#vst canvas').getBoundingClientRect(),h=document.getElementById('vst').getBoundingClientRect();return Math.abs(b.width/b.height-595/842)<.01&&b.height<=h.height&&b.width<=h.width}),'portrait remains proportional and uncropped');
  await evaluate(`document.getElementById('vpreviewfs').click();podium.ext.S.pres=[]`);
  assert.equal(await evaluate('PTPresentations.restore(podium.ext.S)'),true);assert.equal(await evaluate('podium.ext.S.pres.length'),3,'metadata restores after losing a local snapshot');
  assert.deepEqual(errors,[]);
  console.log('Passed: private upload client, original byte preservation, queued PPTX, real PDF.js pages/context, keyboard bounds, fidelity warning, desktop/mobile/fullscreen landscape and portrait sizing, metadata restore.');
  console.log('Preview screenshot: '+path.join(tmpdir(),'presenttrack-pdf-viewer.png'));
  await call('Browser.close');
}finally{ws?.close();chrome.kill();await delay(500);await rm(profile,{recursive:true,force:true,maxRetries:3})}
