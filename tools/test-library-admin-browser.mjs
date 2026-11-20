// Real admin Library UI with offline account/storage fixtures; no live deletions.
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const scripts = new Set(['auth', 'identity', 'practice-audio', 'workspace-model', 'tour-steps', 'tour-spotlight', 'dashboard', 'library']);
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url;
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
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
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
    await evaluate(`PTCloud.user={id:'student',app_metadata:{role:'student'}};podium.ext.go('library')`);
    await wait('!!document.querySelector(".library-card")');
    assert.equal(await evaluate('!!document.querySelector("#admin-add-presentation,[data-admin-delete]")'), false, 'Students have no management buttons');
    await evaluate(`PTCloud.user={id:'admin',app_metadata:{role:'admin',must_change_password:true}};podium.ext.go('library')`);
    assert.equal(await evaluate('!!document.querySelector("#admin-add-presentation,[data-admin-delete]")'), false, 'Initial password guard remains');
    console.log(`${width}×${height}: add/cancel/upload/publish, confirmation, deletion retry, student copies and admin guards passed`);
  }
  assert.deepEqual(errors, []);
  console.log(`Screenshots: ${profile}`);
} finally { socket?.close(); chrome.kill(); server.close(); }
