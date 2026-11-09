// Run tools/dev.mjs first. Browser integration fixtures never contact an AI provider.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(path.join(tmpdir(), 'presenttrack-conversation-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-port=9331', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
try {
  let pages;
  for (let i = 0; i < 50; i++) {
    try { pages = await (await fetch('http://127.0.0.1:9331/json/list')).json(); if (pages.some(p => p.type === 'page')) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert.ok(pages?.length, 'Chrome debugging endpoint unavailable');
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Browser timed out: ${method}`)), 15000);
    pending.set(++id, result => { clearTimeout(timer); result.error ? reject(new Error(result.error.message)) : resolve(result.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.testRequests=[];window.testRecognizers=[];
    window.SpeechRecognition=class {
      constructor(){testRecognizers.push(this)} start(){this.running=true;this.onstart?.()}
      abort(){this.running=false;this.onend?.()} stop(){this.running=false;this.onend?.()}
      result(text){const r=[{transcript:text}];r.isFinal=true;this.onresult?.({results:[r]})}
    };
    const realFetch=window.fetch;
    window.fetch=(url,init)=>{if(url==='/api/coach'){const body=JSON.parse(init.body);testRequests.push(body);return Promise.resolve(new Response(JSON.stringify(body.action?{ready:true}:{reply:'Your latest attempt is 150 WPM. Try a pause between key ideas.'})));}return realFetch(url,init);};
  ` });
  await call('Page.navigate', { url: 'http://127.0.0.1:3000' });
  for (let i = 0; i < 100; i++) { if (await evaluate('!!window.PTVoice && !!window.podium?.ext')) break; await new Promise(r => setTimeout(r, 200)); }
  await evaluate(`(async()=>{
    await PTCloud.client.auth.getSession(); await new Promise(r=>setTimeout(r,100));
    PTCloud.enabled=true;PTCloud.user={id:'browser-test'};
    PTCloud.client.auth.getSession=async()=>({data:{session:{user:{id:'browser-test'},access_token:'test-only'}}});
    document.querySelector('.shell').hidden=true;document.getElementById('app').hidden=false;document.documentElement.classList.add('clay');
    Object.assign(podium.ext.S,{booted:true,loading:false,pres:[],notes:[],goals:[],ses:[{id:1,deck:'Test presentation',wpm:150,fill:3,pau:2,dur:60,tg:60,score:80,analysis:{}}]});
    podium.ext.go('perf');document.getElementById('bot').hidden=false;document.getElementById('bot').className='app';
    podium.setVoice(false);document.getElementById('bc').click();
  })()`);
  assert.equal(await evaluate(`!document.getElementById('tracy-voice').hidden`), true, 'Click robot opens conversation');
  await evaluate(`document.getElementById('tracy-input').value='How did I do?';document.getElementById('tracy-form').requestSubmit()`);
  for (let i = 0; i < 30; i++) { if (await evaluate(`document.querySelectorAll('.tracy-message').length===2`)) break; await new Promise(r => setTimeout(r, 50)); }
  assert.equal(await evaluate(`document.querySelectorAll('.tracy-message').length`), 2, JSON.stringify(await evaluate(`({status:document.getElementById('tracy-status').textContent,history:document.getElementById('tracy-history').textContent,user:PTCloud.user?.id})`)) + JSON.stringify(errors));
  assert.equal(await evaluate(`testRequests[0].context.results[0].wpm`), 150);
  assert.equal(await evaluate(`testRecognizers.length`), 0);
  await evaluate(`PTVoice.close();document.getElementById('bc').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('.tracy-message').length`), 2);
  for (const [width, height] of [[1440,900],[390,844],[320,568],[844,390]]) for (const theme of ['light','dark']) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.tracy-settings').open=false;document.querySelector('.tracy-privacy').open=false;PTVoice.open()`);
    const fit = await evaluate(`(()=>{const p=document.getElementById('tracy-voice'),r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&p.scrollWidth<=p.clientWidth+1})()`);
    assert.ok(fit, `Panel overflow at ${width}x${height} ${theme}`);
    await evaluate(`document.getElementById('tracy-input').scrollIntoView({block:'nearest'});`);
    assert.equal(await evaluate(`(()=>{const b=document.getElementById('tracy-send'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`), true);
    if (width === 390 && theme === 'dark') {
      await evaluate(`PTVoice.open()`);
      const shot = await call('Page.captureScreenshot');
      await writeFile(path.join(tmpdir(), 'presenttrack-conversation.png'), Buffer.from(shot.data, 'base64'));
    }
  }
  await evaluate(`(async()=>{document.getElementById('tracy-handsfree').checked=false;await PTVoice.start();testRecognizers.at(-1).result('And what about fillers?')})()`);
  for (let i = 0; i < 30; i++) { if (await evaluate(`PTVoice.state==='muted'`)) break; await new Promise(r => setTimeout(r, 50)); }
  assert.equal(await evaluate(`PTVoice.state`), 'muted');
  assert.equal(await evaluate(`testRequests.at(-1).history.length`), 2);
  assert.equal(await evaluate(`testRecognizers.at(-1).running`), false);
  assert.equal(await evaluate(`document.querySelectorAll('.tracy-message').length`), 4);
  await evaluate(`document.getElementById('tracy-clear').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.tracy-message').length`), 0);
  assert.equal(await evaluate(`PTVoice.active`), false);
  assert.deepEqual(errors, []);
  console.log('Passed typed/voice continuity, context, robot click, one-turn mic, clear and 8 panel/composer layouts. Screenshot: ' + path.join(tmpdir(), 'presenttrack-conversation.png'));
  await call('Browser.close');
} finally {
  ws?.close(); chrome.kill(); await new Promise(r => setTimeout(r, 500));
  const resolved = path.resolve(profile), tempRoot = path.resolve(tmpdir()) + path.sep;
  if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('presenttrack-conversation-')) throw new Error('Unexpected Chrome profile path');
  await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
}
