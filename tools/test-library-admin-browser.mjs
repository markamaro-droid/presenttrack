// Real admin Library UI with offline account/storage fixtures; no live deletions.
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { pdfAsset, pdfRoot } from './pdf-assets.mjs';

const root = resolve(import.meta.dirname, '..');
const scripts = new Set(['auth', 'identity', 'practice-audio', 'workspace-model', 'tour-steps', 'tour-spotlight', 'dashboard', 'pdf-viewer', 'presentations', 'library-viewer', 'library-covers', 'library']);
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url;
    const pdfMatch = pdfAsset.exec(path.slice(1));
    if (pdfMatch) { res.setHeader('Content-Type', path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'); res.end(await readFile(join(pdfRoot, pdfMatch[1]))); return; }
    if (!/^\/(index\.html|js\/[\w-]+\.js|css\/[\w-]+\.css|assets\/[\w/.-]+)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, path));
    if (path === '/index.html') data = data.toString().replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => scripts.has(src.replace(/^js\//, '').replace(/\.js$/, '')) ? tag : '').replace(/<link[^>]*href="https:[^>]*>/g, '');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'presenttrack-library-admin-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Chrome startup timed out')), 15000);
    let out = ''; chrome.stderr.on('data', chunk => { out += chunk; const match = out.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    chrome.on('error', reject);
  });
  socket = new WebSocket(endpoint); await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer); msg.error ? p.reject(Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(Error(`Timed out: ${method}`)); }, 15000); pending.set(n, { resolve, reject, timer }); socket.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); } throw Error(`Waiting for: ${expression}`); };
  const shot = async name => { const data = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(profile, name + '.png'), Buffer.from(data.data, 'base64')); };
  await call('Runtime.enable');
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await wait('document.readyState === "complete" && !!window.podium?.ext?.V.library');
    await evaluate(`
      document.documentElement.classList.add('clay');document.documentElement.dataset.theme='dark';document.querySelector('.shell').hidden=true;document.querySelector('#app').hidden=false;
      window.catalog=[{id:'8edc4387-59cf-4d9d-968e-c26337da1372',title:'Classroom introduction',description:'A short presentation for speaking practice.',category:'Communication',target_seconds:180,source:'upload',file_name:'introduction.pptx',published:true},{id:'built-in',title:'Starter presentation',description:'Built-in practice slides.',category:'General',target_seconds:180,source:'builtin',published:true}];
      window.deleteRequests=[];window.uploads=[];window.deleteFailure=false;
      window.PTCloud={enabled:true,user:{id:'admin-test',email:'admin@example.test',app_metadata:{role:'admin',must_change_password:false}},client:{
        auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},
        from:()=>({select:()=>({order:async()=>({data:catalog})}),insert:async row=>{catalog.push(row);return{}},update:patch=>({eq:(key,id)=>({select:async()=>{Object.assign(catalog.find(r=>r.id===id),patch);return{data:[{id}]}}})})}),
        storage:{from:()=>({upload:async(path,file)=>{uploads.push({path,name:file.name});return{}},remove:async()=>({})})}
      }};
      window.PTPDF={load:async()=>{}};window.JSZip={};window.PTPresentationContent={selectUpload:files=>{if(!files[0])throw Error('Choose a file.');return{file:files[0]}},scan:async()=>({text:'Classroom slides',pages:['Classroom slides']})};
      const originalFetch=window.fetch;window.fetch=async(url,options)=>{
        if(url!=='/api/admin')return originalFetch(url,options);
        const body=JSON.parse(options.body);deleteRequests.push({body,authorization:options.headers.Authorization});
        if(deleteFailure){catalog.find(r=>r.id===body.id).published=false;return new Response(JSON.stringify({code:'library_delete_pending',message:'The presentation is hidden, but deletion could not finish. Click Delete again to complete it.'}),{status:503});}
        catalog=catalog.filter(r=>r.id!==body.id);return new Response(JSON.stringify({deleted:true}));
      };
      const S=podium.ext.S;S.u={name:'Library Admin',email:'admin@example.test',pic:''};S.booted=true;S.loading=false;S.evalRequired=false;S.pres=[{id:1,libraryId:catalog[0].id,t:'Student copy'}];S.ses=[{id:1}];podium.ext.go('library');
    `);
    await wait('document.querySelectorAll(".library-editor").length===2');
    assert.equal(await evaluate('document.querySelector("#admin-upload-panel").hidden'), true);
    assert.equal(await evaluate('document.querySelectorAll("[data-admin-delete]").length'), 1);
    await new Promise(r => setTimeout(r, 900));
    await shot('library-' + width);
    await evaluate(`document.querySelector('#admin-add-presentation').click()`);
    assert.equal(await evaluate('document.activeElement.id'), 'admin-title');
    assert.equal(await evaluate('document.querySelector("#admin-add-presentation").getAttribute("aria-expanded")'), 'true');
    await evaluate(`document.querySelector('#admin-title').value='Discard me';document.querySelector('#admin-upload-cancel').click()`);
    assert.equal(await evaluate('document.querySelector("#admin-upload-panel").hidden'), true);
    assert.equal(await evaluate('document.activeElement.id'), 'admin-add-presentation');
    assert.equal(await evaluate('uploads.length'), 0);
    await evaluate(`document.querySelector('#admin-add-presentation').click();document.querySelector('#admin-title').value='New shared deck';const dt=new DataTransfer();dt.items.add(new File(['fixture'],'lesson.pdf',{type:'application/pdf'}));document.querySelector('#admin-file').files=dt.files;document.querySelector('#admin-upload').requestSubmit()`);
    await wait('document.querySelectorAll(".library-editor").length===3');
    assert.equal(await evaluate('uploads.length'), 1);
    assert.equal(await evaluate('catalog.at(-1).published'), false);
    await evaluate(`const f=[...document.querySelectorAll('.library-editor')].at(-1);f.elements.published.checked=true;f.requestSubmit()`);
    await wait('catalog.at(-1).published && !document.querySelector(".library-editor[data-busy]")');
    const deleteSelector = '[data-admin-delete="8edc4387-59cf-4d9d-968e-c26337da1372"]';
    await evaluate(`document.querySelector('${deleteSelector}').click()`);
    await wait('!!document.querySelector("[role=alertdialog]")');
    assert.equal(await evaluate('document.activeElement.dataset.r'), '0', 'Cancel is focused first');
    await evaluate(`document.querySelector('[data-r="0"]').click()`);
    assert.equal(await evaluate('deleteRequests.length'), 0, 'Cancel sends no delete request');
    await evaluate(`deleteFailure=true;document.querySelector('${deleteSelector}').click();document.querySelector('[data-r="1"]').click()`);
    await wait('document.querySelector(".library-editor [role=status]").textContent.includes("Click Delete again")');
    assert.equal(await evaluate('document.querySelector(".library-editor").elements.published.checked'), false);
    assert.equal(await evaluate(`document.querySelector('${deleteSelector}').disabled`), false, 'Retry stays available');
    await evaluate(`deleteFailure=false;document.querySelector('${deleteSelector}').click();document.querySelector('[data-r="1"]').click()`);
    await wait('document.querySelectorAll(".library-editor").length===2');
    assert.equal(await evaluate(`!!document.querySelector('${deleteSelector}')`), false);
    assert.deepEqual(await evaluate('deleteRequests.at(-1)'), { body: { action: 'delete-library-presentation', id: '8edc4387-59cf-4d9d-968e-c26337da1372' }, authorization: 'Bearer test-token' });
    assert.deepEqual(await evaluate('[podium.ext.S.pres.length,podium.ext.S.ses.length]'), [1, 1]);
    await evaluate(`document.querySelector('[data-admin-delete]').click();PTCloud.user.id='different-user';document.querySelector('[data-r="1"]').click()`);
    assert.equal(await evaluate('deleteRequests.length'), 2, 'Account changes cancel pending deletion');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Library fits viewport');
    await evaluate(`podium.ext.go('library');window.preparedUploads=[];const originalRequest=PTPresentations.request;window.restoreRequest=()=>PTPresentations.request=originalRequest;PTPresentations.request=async(action,id,extra)=>{if(action==='library-prepare')preparedUploads.push({id,extra});return{preview:{state:'not_prepared'}}};document.querySelector('#admin-add-presentation').click();document.querySelector('#admin-title').value='New PowerPoint';const ppt=new DataTransfer();ppt.items.add(new File(['fixture'],'new.pptx'));document.querySelector('#admin-file').files=ppt.files;document.querySelector('#admin-file').dispatchEvent(new Event('change'));document.querySelector('#admin-upload').dispatchEvent(new Event('submit',{cancelable:true}))`);
    await wait('document.querySelector("#admin-upload-status").textContent.includes("Agree to CloudConvert")');
    assert.equal(await evaluate('preparedUploads.length'), 0);
    await evaluate(`document.querySelector('#admin-preview-consent').checked=true;document.querySelector('#admin-upload').requestSubmit()`);
    await wait('preparedUploads.length===1 && !!document.querySelector(".library-editor") && document.querySelector("#admin-upload-panel").hidden');
    assert.equal(await evaluate('preparedUploads[0].extra.cloudconvertConsent'), true);
    assert.equal(await evaluate('podium.ext.S.arg.preparing'), await evaluate('preparedUploads[0].id'));
    await evaluate('restoreRequest()');
    await evaluate(`PTCloud.user={id:'student',app_metadata:{role:'student'}};podium.ext.go('library')`);
    await wait('!!document.querySelector(".library-card")');
    assert.equal(await evaluate('!!document.querySelector("#admin-add-presentation,[data-admin-delete]")'), false, 'Students have no management buttons');
    await evaluate(`PTCloud.user={id:'admin',app_metadata:{role:'admin',must_change_password:true}};podium.ext.go('library')`);
    assert.equal(await evaluate('!!document.querySelector("#admin-add-presentation,[data-admin-delete]")'), false, 'Initial password guard remains');
    console.log(`${width}×${height}: add/cancel/upload/publish, confirmation, deletion retry, student copies and admin guards passed`);
  }
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await wait('document.readyState === "complete" && !!window.PTLibraryViewer');
    await evaluate(`
      document.documentElement.classList.add('clay');document.documentElement.dataset.theme='dark';document.querySelector('.shell').hidden=true;document.querySelector('#app').hidden=false;
      window.previewRow={id:'33333333-3333-4333-8333-333333333333',title:'Classroom introduction',description:'Original presentation layout',category:'Communication',target_seconds:180,source:'upload',file_name:'introduction.pptx',published:true};
      window.PTCloud={enabled:true,user:{id:'11111111-1111-4111-8111-111111111111',app_metadata:{role:'admin',must_change_password:false}},client:{auth:{getSession:async()=>({data:{session:{user:PTCloud.user,access_token:'offline-token'}}})},from:()=>({select:()=>({order:async()=>({data:[previewRow]})})})}};
      window.previewRequests=[];window.previewState='not_prepared';window.previewFail=false;
      const realFetch=window.fetch;window.fetch=async(url,options)=>{
        if(url!=='/api/presentations')return realFetch(url,options);
        const body=JSON.parse(options.body);previewRequests.push(body);
        if(previewFail)return new Response(JSON.stringify({message:'Preview connection unavailable.'}),{status:503});
        if(body.action==='library-prepare'){previewState='completed';return Response.json({preview:{state:'processing',warnings:[]}});}
        return Response.json({preview:{state:previewState,canPrepare:true,url:'/assets/library/confident-introductions.pdf',warnings:[]}});
      };
      const S=podium.ext.S;S.u={name:'Library Admin',email:'admin@example.test',pic:''};S.booted=true;S.loading=false;S.evalRequired=false;podium.ext.go('libraryDetail',previewRow);
    `);
    await wait('!!document.querySelector(".library-preview-consent")');
    assert.equal(await evaluate('document.querySelector(".library-preview-message button").disabled'), true);
    assert.equal(await evaluate('document.querySelectorAll(".library-slides").length'), 0);
    assert.equal(await evaluate('previewRequests.filter(r=>r.action==="library-prepare").length'), 0);
    await evaluate(`const consent=document.querySelector('.library-preview-consent input');consent.checked=true;consent.dispatchEvent(new Event('change'));document.querySelector('.library-preview-message button').click()`);
    await wait('!!document.querySelector("#library-preview-stage canvas")');
    assert.equal(await evaluate('document.querySelector("#library-preview-page").textContent'), 'Slide 1 of 5');
    const first = await evaluate('document.querySelector("#library-preview-stage canvas").toDataURL()');
    await evaluate(`document.querySelector('[data-library-page="1"]').click()`);
    await wait('document.querySelector("#library-preview-stage canvas")?.getAttribute("aria-label")==="Slide 2 of 5"');
    assert.notEqual(await evaluate('document.querySelector("#library-preview-stage canvas").toDataURL()'), first, 'Actual PDF pixels change between slides');
    await evaluate(`document.querySelector('[data-library-page="-1"]').click()`);
    await wait('document.querySelector("#library-preview-stage canvas")?.getAttribute("aria-label")==="Slide 1 of 5"');
    await new Promise(r => setTimeout(r, 200));
    assert.ok(await evaluate(`(()=>{const c=document.querySelector('#library-preview-stage canvas').getBoundingClientRect(),s=document.querySelector('#library-preview-stage').getBoundingClientRect();return c.width>100 && c.height>50 && c.width<=s.width && c.height<=s.height && document.documentElement.scrollWidth<=innerWidth+1})()`), 'Canvas fits the viewer');
    await shot('preview-' + width);
    await evaluate(`document.querySelector('#library-preview-fullscreen').click()`);
    await wait('document.fullscreenElement?.id==="library-preview"');
    await evaluate('document.exitFullscreen()');
    await wait('!document.fullscreenElement');
    await evaluate(`podium.ext.go('library');podium.ext.go('libraryDetail',previewRow)`);
    await wait('!!document.querySelector("#library-preview-stage canvas")');
    assert.equal(await evaluate('previewRequests.filter(r=>r.action==="library-prepare").length'), 1, 'Reopening reuses the PDF');
    await evaluate(`podium.ext.go('library')`);
    await wait('!!document.querySelector(".library-editor [data-library-cover] img")?.complete');
    assert.equal(await evaluate('document.querySelector(".library-edit-details").open'), false);
    assert.ok(await evaluate('document.querySelector(".library-editor").getBoundingClientRect().width<=460'));
    await new Promise(r=>setTimeout(r,700)); await shot('admin-cover-' + width);
    if (width === 1440) {
      await evaluate(`delete previewRow.cover;previewState='processing';podium.ext.go('library',{preparing:previewRow.id})`);
      await wait('document.querySelector(".library-editor .deck-cover-message")?.textContent.includes("being prepared")');
      await evaluate(`previewState='completed'`);
      await new Promise(r => setTimeout(r, 8200));
      await wait('!!document.querySelector(".library-editor .deck-cover img")?.complete');
      assert.equal(await evaluate('previewRequests.at(-1).thumbnail'), false, 'New upload follows its existing conversion until the card has a cover');
      assert.equal(await evaluate('previewRequests.filter(r=>r.action==="library-prepare").length'), 1, 'Following a conversion does not prepare a duplicate');
    }
    await evaluate(`previewRow.file_name='lesson.pdf';previewFail=true;podium.ext.go('libraryDetail',previewRow)`);
    await wait('document.querySelector(".library-preview-message")?.textContent.includes("Preview connection unavailable")');
    await evaluate(`previewFail=false;document.querySelector('.library-preview-message button').click()`);
    await wait('!!document.querySelector("#library-preview-stage canvas")');
    assert.equal(await evaluate('previewRequests.filter(r=>r.action==="library-prepare").length'), 1, 'PDF opens never prepare PowerPoint');
    await evaluate(`previewState='processing';podium.ext.go('libraryDetail',previewRow)`);
    await wait('document.querySelector(".library-preview-message")?.textContent.includes("Preparing your original slide layout")');
    await evaluate(`podium.ext.go('library')`);
    await wait('!!document.querySelector(".library-editor .deck-cover img") || document.querySelector(".library-editor .deck-cover-message")?.textContent.includes("being prepared")');
    await evaluate('window.requestsAtExit=previewRequests.length');
    await new Promise(r => setTimeout(r, 4200));
    assert.equal(await evaluate('previewRequests.length'), await evaluate('requestsAtExit'), 'Leaving the view cancels polling');
    await evaluate(`previewState='completed';delete previewRow.cover;PTCloud.user.app_metadata={role:'student'};podium.ext.go('library')`);
    await wait('!!document.querySelector("[data-library-cover] img")?.complete');
    assert.ok(await evaluate(`(()=>{const card=document.querySelector('.library-card').getBoundingClientRect(),img=document.querySelector('[data-library-cover] img');return card.width<=460 && img.naturalWidth>100 && document.documentElement.scrollWidth<=innerWidth+1})()`));
    assert.equal(await evaluate('previewRequests.at(-1).thumbnail'), true);
    const requestsBeforeSearch = await evaluate('previewRequests.length');
    await evaluate(`const search=document.querySelector('#library-search');search.value='No matching deck';search.dispatchEvent(new Event('input'));search.value='';search.dispatchEvent(new Event('input'))`);
    await wait('!!document.querySelector("[data-library-cover] img")?.complete');
    assert.equal(await evaluate('previewRequests.length'), requestsBeforeSearch, 'Search reuses the loaded cover');
    await new Promise(r => setTimeout(r, 700)); await shot('library-cover-' + width);
    console.log(`${width}×${height}: real slides and first-page Library cards, cached search, paging, consent, full screen and polling cleanup passed`);
  }
  assert.deepEqual(errors, []);
  console.log(`Screenshots: ${profile}`);
} finally { socket?.close(); chrome.kill(); server.close(); }
