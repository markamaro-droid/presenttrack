import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
export async function checkLibraryAssets({evaluate,call}) {
 const result=await evaluate(`(async()=>{
  for(const [global,url] of [['JSZip','https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'],['pdfjsLib','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js']]){
   if(!window[global])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>reject(Error('Library reader unavailable'));document.head.append(s)});
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const catalog=await(await fetch('/assets/library/catalog.json')).json();const checks=[];
  for(const row of catalog){
   const file=new File([await(await fetch(row.file_path)).blob()],row.file_name);
   const parsed=await PTPresentationContent.scan(file,{zip:JSZip});
   const pdf=await pdfjsLib.getDocument({data:await(await fetch(row.preview_path)).arrayBuffer()}).promise;
   const first=await pdf.getPage(1),text=await first.getTextContent();
   checks.push({pptxSlides:parsed.pages.length,pdfSlides:pdf.numPages,first:parsed.pages[0],pdfText:text.items.map(x=>x.str).join(' ')});
   if(checks.length===1){const canvas=document.createElement('canvas');canvas.id='library-asset-preview';const viewport=first.getViewport({scale:1});canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.cssText='position:fixed;z-index:999999;left:0;top:0;max-width:100vw';document.body.append(canvas);await first.render({canvasContext:canvas.getContext('2d'),viewport}).promise;}
   await pdf.destroy();
  }
  return checks;
 })()`);
 assert.equal(result.length,3);
 for(const check of result){assert.equal(check.pptxSlides,5);assert.equal(check.pdfSlides,5);assert.ok(check.first.length>100);assert.ok(check.pdfText.length>100);}
 const shot=await call('Page.captureScreenshot',{format:'png'});
 await writeFile(path.join(tmpdir(),'presenttrack-library-slide.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`document.getElementById('library-asset-preview').remove()`);
 console.log('Passed: real JSZip reads all three PPTX decks; PDF.js reads matching five-page previews and renders a slide.');
}
export async function checkLibrary({ evaluate, call }) {
 const wait = () => new Promise(r => setTimeout(r,200));
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate(`(async()=>{
 window.libraryRows=await(await fetch('/assets/library/catalog.json')).json();window.libraryFiles=new Map();
 PTCloud.download=async path=>({blob:libraryFiles.get(path)||new Blob(['saved preview'])});
 PTCloud.upload=async(path,file)=>{libraryFiles.set(path,file);return{}};
 PTCloud.client={from:table=>({
 select:()=>({order:async()=>({data:libraryRows})}),
 insert:async row=>{libraryRows.push(row);return{}},
 update:patch=>({eq:(key,id)=>({select:async()=>{Object.assign(libraryRows.find(r=>r.id===id),patch);return{data:[{id}]}}})})
 }),storage:{from:()=>({upload:async(path,file)=>{libraryFiles.set(path,file);return{}},remove:async()=>({}),download:async path=>({data:libraryFiles.get(path)})})}};
 podium.ext.go('library');
 })()`);
 await wait();
 assert.equal(await evaluate(`document.querySelectorAll('.library-card').length`),3);
 assert.equal(await evaluate(`!!document.querySelector('#nav [data-go=library]')`),true);
 assert.equal(await evaluate(`!!document.querySelector('#nav [data-go=admin]')`),false);
 await evaluate(`document.getElementById('library-search').value='project';document.getElementById('library-search').dispatchEvent(new Event('input'))`);
 assert.equal(await evaluate(`document.querySelectorAll('.library-card').length`),1);
 await evaluate(`document.querySelector('[data-library-open]').click()`);
 assert.equal(await evaluate(`document.querySelectorAll('.library-slides li').length`),5);
 const before=await evaluate('podium.ext.S.pres.length');
 await evaluate(`document.getElementById('library-use').click()`);
 for(let i=0;i<60;i++){if(await evaluate(`podium.ext.S.view==='prac'`))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await evaluate('podium.ext.S.pres.length'),before+1);
 assert.equal(await evaluate(`podium.ext.S.pres.at(-1).context.pages.length`),5);
 assert.match(await evaluate(`podium.ext.S.pres.at(-1).slidePath`),/slides\.pdf$/);
 assert.equal(await evaluate(`libraryFiles.size`),2,'PPTX and PDF preview saved to student storage');
 await evaluate(`delete podium.ext.FILES[podium.ext.S.pres.at(-1).id];podium.ext.go('prac',podium.ext.S.pres.at(-1).id)`);
 await wait();
 assert.equal(await evaluate(`!!document.querySelector('#vst canvas')`),true);
 await evaluate(`podium.ext.go('libraryDetail',libraryRows[2]);document.getElementById('library-use').click()`);
 assert.equal(await evaluate('podium.ext.S.pres.length'),before+1,'library copy is not duplicated');
 await evaluate(`PTCloud.saveNow=async()=>({error:'offline'});PTCloud.remove=async paths=>{paths.forEach(p=>libraryFiles.delete(p));return{}};podium.ext.go('libraryDetail',libraryRows[0]);document.getElementById('library-use').click()`);
 await wait();
 assert.equal(await evaluate('podium.ext.S.pres.length'),before+1);
 assert.equal(await evaluate('libraryFiles.size'),2);
 assert.match(await evaluate(`document.getElementById('library-action-status').textContent`),/Could not save/);
 await evaluate(`PTCloud.saveNow=async()=>({});PTCloud.user={id:'admin-preview',email:'admin@admin.presenttrack.invalid',app_metadata:{role:'admin',must_change_password:true}};podium.ext.go('library')`);
 assert.equal(await evaluate('podium.ext.S.view'),'admin','initial admin must change password');
 assert.equal(await evaluate(`!!document.getElementById('admin-credentials')`),true);
 assert.equal(await evaluate(`!!document.getElementById('admin-upload')`),false);
 await evaluate(`PTCloud.user.app_metadata.must_change_password=false;podium.ext.go('admin')`);
 await wait();
 assert.equal(await evaluate(`document.querySelectorAll('.library-editor').length`),3);
 if(process.env.CHECK_LIBRARY_ASSETS){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(tmpdir(),'presenttrack-admin.png'),Buffer.from(shot.data,'base64'));}
 await evaluate(`(()=>{const f=document.querySelector('.library-editor');f.elements.published.checked=false;f.dispatchEvent(new Event('submit',{cancelable:true}))})()`);
 await wait(); assert.equal(await evaluate('libraryRows[0].published'),false);
 await evaluate(`document.getElementById('admin-title').value='New shared deck';document.getElementById('admin-description').value='Classroom practice';pick('admin-file',[new File(['PDF'],'class.pdf',{type:'application/pdf'})]);document.getElementById('admin-upload').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await wait(); assert.equal(await evaluate('libraryRows.length'),4);
 assert.equal(await evaluate('libraryRows.at(-1).published'),false);
 await evaluate(`(()=>{const f=[...document.querySelectorAll('.library-editor')].at(-1);f.elements.published.checked=true;f.dispatchEvent(new Event('submit',{cancelable:true}))})()`);
 await wait(); assert.equal(await evaluate('libraryRows.at(-1).published'),true);
 await evaluate(`(()=>{
 const originalFetch=window.fetch;
 window.fetch=async(url,opts)=>{if(url==='/api/admin'){window.credentialRequest=JSON.parse(opts.body);return new Response(JSON.stringify({updated:true}))};return originalFetch(url,opts)};
 PTCloud.client.auth={getSession:async()=>({data:{session:{access_token:'mock-token'}}}),signInWithPassword:async args=>{window.newLogin=args;return{data:{user:{id:'admin-preview',email:args.email,app_metadata:{role:'admin',must_change_password:false}}}}}};
 document.getElementById('admin-username').value='newowner';document.getElementById('admin-current').value='old-password';document.getElementById('admin-password').value='new-test-password-123';document.getElementById('admin-confirm').value='new-test-password-123';document.getElementById('admin-credentials').dispatchEvent(new Event('submit',{cancelable:true}));
 })()`);
 await wait(); assert.equal(await evaluate('credentialRequest.currentPassword'),'old-password');
 assert.equal(await evaluate('newLogin.email'),'newowner@admin.presenttrack.invalid');
 assert.equal(await evaluate(`document.getElementById('admin-password').value`),'');
 await evaluate(`PTCloud.user={id:'preview'};podium.ext.go('library')`);
 await wait(); assert.equal(await evaluate(`document.querySelectorAll('.library-card').length`),3,'hidden deck excluded from student catalog');
 for(const [width,height] of [[1440,900],[390,844]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
   await evaluate(`podium.ext.go('library')`); await wait();
   assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+2`),'library fits viewport');
   if(process.env.CHECK_LIBRARY_ASSETS){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(tmpdir(),'presenttrack-library-'+width+'.png'),Buffer.from(shot.data,'base64'));}
 }
 await evaluate(`(()=>{
 window.adminWelcomeCalls=0;podium.welcomePrepare=()=>adminWelcomeCalls++;
 PTCloud.signIn=async(email,password)=>{window.portalLogin={email,password};PTCloud.user={id:'admin-preview',email,app_metadata:{role:'admin',must_change_password:true}};PTCloud.row=null;return{name:'Administrator'}};
 document.getElementById('le').value='admin';document.getElementById('lp').value='admin1234';document.getElementById('loginForm').dispatchEvent(new Event('submit',{cancelable:true}));
 })()`);
 for(let i=0;i<60;i++){if(await evaluate(`podium.ext.S.view==='admin'&&!document.getElementById('app').hidden`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate('portalLogin.email'),'admin@admin.presenttrack.invalid');
 assert.equal(await evaluate('podium.ext.S.view'),'admin','same portal routes administrator to admin dashboard');
 assert.equal(await evaluate('adminWelcomeCalls'),0,'administrator does not consume student greeting quota');
 console.log('Passed: library search, detail, saved copy, reopen, deduplication, rollback, admin guard, drafts, publishing, credentials, student visibility and responsive layout.');
}
