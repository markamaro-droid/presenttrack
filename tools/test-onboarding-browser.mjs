// Offline regression: the actual welcome, doorway, dashboard, and account policy.
// Uses installed Chrome; cloud accounts, WebGL rendering, and voice are stubbed.
// Run with CHROME_PATH if Chrome is installed elsewhere.
// --visual loads the app's existing Three.js CDN assets and model for screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const visual = process.argv.includes('--visual');
const scripts = new Set(['identity', 'auth', 'practice-audio', 'workspace-model', 'tour-steps', 'tour-spotlight', 'dashboard', 'evaluation', 'practice-insights', 'dashboard-home', 'workspace', 'greeting-cache', 'settings', 'robot-menu', 'welcome-intro', 'welcome-door']);
if (visual) scripts.add('robot');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname === '/' ? '/index.html' : pathname;
    if (!/^\/(index\.html|js\/[\w-]+\.js|css\/[\w-]+\.css|assets\/[\w/.-]+)$/.test(file) || file.includes('..')) { res.writeHead(404).end(); return; }
    let data = await readFile(join(root, file));
    if (file === '/index.html') data = data.toString()
      .replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => {
        if (visual && src === 'js/robot.js') return '<script>window.PTVoice={active:false,setHooks(){},stop(){},setSpeaker(){},open(){},toggle(){}};</script>' + tag;
        return scripts.has(src.replace(/^js\//, '').replace(/\.js$/, '')) || src === 'assets/evaluation/study-habits.js' || (visual && (src === 'assets/models/robot-glb.js' || src.startsWith('https://cdn.jsdelivr.net/npm/three@0.128.0/'))) ? tag : '';
      })
      .replace(/<link[^>]*href="https:[^>]*>/g, '');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'presenttrack-onboarding-'));
const screenshots = visual || process.argv.includes('--screenshots') ? await mkdtemp(join(tmpdir(), 'presenttrack-onboarding-shots-')) : null;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Chrome startup timed out')), 15000);
    let output = '';
    chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    chrome.on('error', error => { clearTimeout(timeout); reject(error); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', e => {
    const message = JSON.parse(e.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); clearTimeout(waiter.timeout); message.error ? waiter.reject(Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    const timeout = setTimeout(() => { pending.delete(n); reject(Error(`${method} timed out`)); }, 15000);
    pending.set(n, { resolve, reject, timeout }); socket.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Runtime.enable');
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 12000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); }
    throw Error(`Timed out waiting for ${label}`);
  };
  const media = async reduced => call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  const fresh = async (width = 1440, height = 900, reduced = false) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await media(reduced);
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await waitFor('document.readyState === "complete" && !!window.podium?.welcomeEnter && !!podium.ext', 'application scripts');
    await evaluate(`
      window.PTCloud = { enabled: false };
      window.PTPresentations = { restore: async () => false };
      window.preparedNarration = [];
      podium.prepareNarration = text => window.preparedNarration.push(text);
      ${visual ? '' : 'podium.robotReady = () => true;'}
      podium.robotIntroduce = () => {};
      ${visual ? '' : 'podium.robotPoint = () => {}; podium.hushNow = () => {};'}
      podium.narrate = () => {};
      podium.narState = () => ({ voice: true, started: true, ended: false });
      window.doorSpeech = { calls: [], started: 0, ended: 0 };
      const deliverDoorSpeech = (text, hooks = {}) => {
        window.doorSpeech.calls.push(text);
        setTimeout(() => { window.doorSpeech.started++; hooks.onstart?.(); }, 100);
        setTimeout(() => { window.doorSpeech.ended++; hooks.onend?.(); }, 2000);
        return {cancel(){}};
      };
      ${visual ? 'window.TracyAudio={speak:deliverDoorSpeech,cancel(){}};' : 'podium.robotDoorNarrate=deliverDoorSpeech;'}
      ${visual ? '' : `podium.robotShow = (visible, where) => {
        const bot = document.getElementById('bot');
        document.body.appendChild(bot); bot.hidden = !visible;
        bot.classList.toggle('app', where === 'app');
      };`}
    `);
  };
  const welcome = async (email, registered = false) => {
    await evaluate(`podium.newUser = ${registered}; podium.enter('Onboarding Tester', ${JSON.stringify(email)});`);
    await waitFor('!!document.getElementById("leval") && !document.getElementById("land").hidden && document.getElementById("wipe").hidden', 'welcome screen');
    if (visual) await waitFor('podium.robotReady()', 'actual Tracy model');
    await evaluate(`document.getElementById('welcome-skip').click();`);
    assert.equal(await evaluate(`document.getElementById('leval').hidden`), false, 'start action is available');
  };
  const enterDashboard = async ({ auto, inspectDoor = false } = {}) => {
    await evaluate(`window.clickedEvaluationRect=document.getElementById('leval').getBoundingClientRect().toJSON();document.getElementById('leval').click(); document.getElementById('leval').click();`);
    if (inspectDoor) {
      assert.equal(await evaluate(`document.querySelectorAll('#welcome-door').length`), 1, 'duplicate click starts one transition');
      assert.equal(await evaluate(`document.querySelector('.welcome-door-actor')?.contains(document.getElementById('bot'))`), true, 'the actual Tracy moves into the scene');
      assert.equal(await evaluate(`document.querySelector('#app').hidden`), true, 'dashboard waits for the doorway');
      assert.equal(await evaluate(`podium.tourOn()`), false, 'tour does not run behind the door');
      const morph = await evaluate(`(() => {
        const frame=document.querySelector('.welcome-door-frame'), animation=frame.getAnimations().find(a=>a.effect?.target===frame);
        if(!animation)return null;
        const time=animation.currentTime;animation.pause();animation.currentTime=0;
        const initial=frame.getBoundingClientRect().toJSON();animation.currentTime=time;animation.play();
        return {initial,button:window.clickedEvaluationRect};
      })()`);
      assert.ok(morph, 'the door morphs from the clicked evaluation button');
      for(const key of ['left','top','width','height'])assert.ok(Math.abs(morph.initial[key]-morph.button[key])<2,`${key}: portal starts at the button (${JSON.stringify(morph)})`);
      await new Promise(r=>setTimeout(r,900));
      const geometry = await evaluate(`(() => {const r = document.querySelector('.welcome-door-frame').getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
      assert.equal(geometry.fits, true, 'door fits the viewport');
      assert.equal(geometry.overflow, false, 'no horizontal overflow');
      assert.equal(await evaluate(`(()=>{const door=document.querySelector('.welcome-door-frame').getBoundingClientRect(),bot=document.querySelector('.welcome-door-actor').getBoundingClientRect();return door.left+door.width/2<bot.left+bot.width/2})()`),true,'the portal opens on Tracy’s left');
      assert.equal(await evaluate('window.doorSpeech.calls.length'),1,'one fixed speech clip per transition');
      assert.equal(await evaluate('window.doorSpeech.calls[0]'),await evaluate('PTWelcomeDoorSpeech.text'),'narration uses the reusable fixed clip');
      await waitFor('window.doorSpeech.started===1','door narration starts');
      assert.equal(await evaluate('window.doorSpeech.started'),1,'speech starts while the portal is open');
      assert.equal(await evaluate(`document.querySelector('#app').hidden`), true, 'the dashboard waits while Tracy speaks');
      if (screenshots) {
        await new Promise(r => setTimeout(r, 550));
        const { data } = await call('Page.captureScreenshot');
        const image = join(screenshots, `door-${await evaluate('innerWidth')}.png`);
        await writeFile(image, Buffer.from(data, 'base64'));
        console.log(`Screenshot: ${image}`);
      }
    }
    if(inspectDoor){
      await waitFor(`document.querySelector('#welcome-door')?.dataset.phase==='crossing'`,'portal morph after Tracy enters');
      assert.equal(await evaluate(`document.getElementById('app').hidden`),false,'real dashboard is visible through the portal');
      assert.equal(await evaluate(`document.getElementById('app').parentElement.className`),'welcome-dashboard-window');
      assert.equal(await evaluate(`document.getElementById('app').inert`),true,'page is not interactive during the morph');
      assert.equal(await evaluate(`podium.tourOn()`),false,'automatic tour waits for the full dashboard');
      const morph=await evaluate(`(()=>{const frame=document.querySelector('.welcome-dashboard-window');const animation=frame.getAnimations().find(a=>a.effect?.target===frame);const end=animation.effect.getKeyframes().at(-1);return {duration:animation.effect.getTiming().duration,end:end.clipPath};})()`);
      assert.equal(morph.duration,1500);assert.match(morph.end,/inset\(0px/);
      if(screenshots){
        const opening=await call('Page.captureScreenshot');
        const openingImage=join(screenshots,`portal-opening-${await evaluate('innerWidth')}.png`);
        await writeFile(openingImage,Buffer.from(opening.data,'base64'));console.log(`Screenshot: ${openingImage}`);
        await new Promise(r=>setTimeout(r,700));const {data}=await call('Page.captureScreenshot');
        const image=join(screenshots,`portal-morph-${await evaluate('innerWidth')}.png`);
        await writeFile(image,Buffer.from(data,'base64'));console.log(`Screenshot: ${image}`);
      }
    }
    await waitFor('!document.querySelector("#welcome-door") && !document.getElementById("app").hidden && !podium.ext.S.loading', 'dashboard reveal');
    assert.equal(await evaluate(`document.getElementById('app').parentElement===document.body && !document.getElementById('app').inert`),true,'same dashboard restored and usable');
    if(inspectDoor)assert.equal(await evaluate('window.doorSpeech.ended'),1,'speech completes before the dashboard is revealed');
    if (auto) await waitFor('podium.tourOn()', 'automatic tour');
    else await new Promise(r => setTimeout(r, 1400));
    assert.equal(await evaluate('podium.tourOn()'), auto, 'automatic tour eligibility');
    assert.equal(await evaluate('podium.ext.S.view'), 'dash', 'dashboard is the destination');
    assert.equal(await evaluate(`document.getElementById('land').hidden`), true);
  };
  const endTour = async () => {
    await evaluate(`document.querySelector('[data-tact="tskip"]').click();`);
    assert.equal(await evaluate('podium.tourOn()'), false, 'tour can be skipped');
  };

  // Completed accounts log straight into their dashboard. Only clicking the
  // logo opens the welcome page, and its portal does not repeat the greeting.
  for (const [width,height,reduced] of [[1440,900,false],[390,844,false],[320,568,true]]) {
    await fresh(width,height,reduced);
    await evaluate(`
      window.PTLearning={};
      window.PTCloud={enabled:true,user:{id:'completed-${width}',user_metadata:{}},
        row:{onboarded:true,data:{pres:[],ses:[],notes:[],goals:[],nid:20}},
        onboarded:true,assessmentDone:true,ready:false,save:async()=>{}};
      podium.newUser=false;podium.enter('Returning Student','completed-${width}@example.test');
    `);
    assert.equal(await evaluate(`!!document.querySelector('#welcome-door')`),false);
    assert.equal(await evaluate(`document.getElementById('land').hidden`),true);
    assert.equal(await evaluate(`document.getElementById('app').hidden`),false);
    assert.deepEqual(await evaluate('window.preparedNarration'),[],'login prepares no greeting');
    assert.deepEqual(await evaluate('window.doorSpeech.calls'),[],'login plays no portal narration');
    assert.equal(await evaluate('podium.ext.S.view'),'dash');
    assert.equal(await evaluate('podium.tourOn()'),false);
    assert.equal(await evaluate(`document.querySelector('.shell').inert`),false);
    assert.equal(await evaluate(`document.getElementById('app').parentElement===document.body&&!document.getElementById('app').inert`),true);
    assert.equal(await evaluate(`document.activeElement?.matches('#view h1, #view h2')`),true);
    await evaluate(`document.querySelector('.sl').click()`);
    await waitFor(`!document.getElementById('land').hidden&&!!document.getElementById('welcome-skip')&&document.getElementById('wipe').hidden`,'manual returning welcome');
    await evaluate(`document.getElementById('welcome-skip').click()`);
    assert.match(await evaluate(`document.querySelector('.welcome-hero .k').textContent`),/Welcome back/);
    assert.equal(await evaluate(`document.getElementById('welcome-intro').textContent`),await evaluate('PTReturningGreeting.text'));
    assert.equal(await evaluate(`document.getElementById('leval').textContent`),'Open dashboard');
    if(visual)await waitFor('podium.robotReady()','returning Tracy model');
    await evaluate(`window.beforePortalPreparation=[...window.preparedNarration];document.getElementById('leval').click();document.getElementById('leval').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#welcome-door').length`),1);
    assert.doesNotMatch(await evaluate(`document.querySelector('#welcome-door').textContent`),/Welcome back|evaluation/i);
    assert.equal(await evaluate(`document.querySelector('.welcome-door-caption').hidden`),true);
    if(!reduced){
      await waitFor(`document.querySelector('#welcome-door')?.dataset.phase==='entering'`,'immediate silent portal entry');
      if(screenshots){
        const {data}=await call('Page.captureScreenshot');
        const file=join(screenshots,`returning-portal-${width}.png`);
        await writeFile(file,Buffer.from(data,'base64'));console.log(`Screenshot: ${file}`);
      }
      await waitFor(`document.querySelector('#welcome-door')?.dataset.phase==='crossing'`,'returning dashboard morph');
      assert.equal(await evaluate(`document.getElementById('app').parentElement.className`),'welcome-dashboard-window');
      assert.equal(await evaluate(`document.getElementById('app').inert`),true);
    }
    await waitFor(`!document.querySelector('#welcome-door')&&!document.getElementById('app').hidden`,'silent returning portal');
    assert.deepEqual(await evaluate('window.doorSpeech.calls'),[],'welcome speech is never repeated at the portal');
    assert.deepEqual(await evaluate('window.preparedNarration'),await evaluate('window.beforePortalPreparation'),'no additional portal speech is prefetched');
    assert.equal(await evaluate('podium.ext.S.view'),'dash');
    assert.equal(await evaluate(`document.activeElement?.matches('#view h1, #view h2')`),true);
    await evaluate(`document.querySelector('.sl').click()`);
    await waitFor(`!document.getElementById('land').hidden&&document.getElementById('wipe').hidden`,'welcome revisit');
    await evaluate(`document.getElementById('welcome-skip').click();document.getElementById('leval').click();document.querySelector('[data-door-skip]').click()`);
    await waitFor(`!document.querySelector('#welcome-door')&&!document.getElementById('app').hidden`,'skip returning portal');
    assert.equal(await evaluate('podium.ext.S.view'),'dash');
    console.log(`PASS returning ${width}x${height}: direct dashboard login, logo welcome page, silent connected portal, Skip and focus`);
  }

  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await fresh(width, height);
    await welcome(`new-${width}@example.test`, true);
    await enterDashboard({ auto: true, inspectDoor: true });
    assert.equal(await evaluate('podium.ext.pendingEval()'), true, 'tour never unlocks evaluation');
    assert.match(await evaluate(`document.querySelector('#spot strong').textContent`), /dashboard/i);
    await endTour();
    await media(width!==1440);
    await welcome(`new-${width}@example.test`, false);
    await enterDashboard({ auto: false });
    assert.equal(await evaluate(`document.activeElement?.matches('#view h1, #view h2')`),true,'returning user receives keyboard focus on the dashboard');
    await evaluate(`podium.setMin(true);document.getElementById('tour-guide').click();`);
    assert.equal(await evaluate('podium.tourOn()'), true, 'manual replay works with Tracy minimized');
    assert.equal(await evaluate(`document.getElementById('bot').hidden`), false);
    const tourChecks = await evaluate(`(async()=>{
      const visited=[];
      for(let i=0;i<PTOnboardingSteps.length;i++){
        podium.tourPause();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
        const dock=document.getElementById('tour'),rect=dock.getBoundingClientRect();
        const buttons=[...dock.querySelectorAll('button')].filter(b=>!b.disabled&&b.getBoundingClientRect().width>0);
        const hit=buttons.every(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});
        visited.push({title:document.querySelector('#spot strong').textContent,fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,hit});
        if(i===1){
          document.querySelector('[data-tact=tprev]').focus();document.querySelector('[data-tact=tprev]').click();
          if(document.activeElement?.dataset.tact!=='tnext')throw Error('Back lost keyboard focus');
          document.querySelector('[data-tact=tnext]').click();podium.tourPause();
        }
        if(i<PTOnboardingSteps.length-1)document.querySelector('[data-tact=tnext]').click();
      }
      return visited;
    })()`);
    assert.equal(tourChecks.length, 9);
    assert.ok(tourChecks.every(step=>step.fits&&step.hit), JSON.stringify({width,tourChecks}));
    assert.equal(await evaluate(`document.querySelector('[data-tact=tadd]').getAttribute('aria-label')`), 'Start evaluation');
    if(screenshots){const {data}=await call('Page.captureScreenshot');await writeFile(join(screenshots,`tour-${width}.png`),Buffer.from(data,'base64'));}
    await evaluate(`document.querySelector('[data-tact=tadd]').click()`);
    assert.equal(await evaluate('podium.tourOn()'), false);
    assert.equal(await evaluate('podium.ext.S.view'), 'eval');
    assert.equal(await evaluate('podium.ext.pendingEval()'), true);
    console.log(`PASS ${width}x${height}: button morph, left portal, fixed narration, repeat click, first-use auto tour, return visit, manual replay and all 9 tour steps`);
  }

  await fresh(390, 844, true);
  await welcome('hidden-tab@example.test', true);
  await evaluate(`window.testHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});document.getElementById('leval').click();window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));`);
  await new Promise(r=>setTimeout(r,1400));
  assert.equal(await evaluate('podium.tourOn()'),false,'hidden tab does not start onboarding');
  assert.equal(await evaluate('podium.ext.S.isNew'),true,'unseen onboarding is not consumed');
  await evaluate(`window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));`);
  await waitFor('podium.tourOn()','visible tab starts onboarding');
  await evaluate(`window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));`);
  assert.equal(await evaluate(`document.querySelector('[data-tact=tplay]').getAttribute('aria-label')`),'Play','leaving the tab pauses the tour');
  await evaluate(`window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));`);
  await endTour();

  // Email-confirmation sign-in still needs onboarding; legacy accounts do not.
  for (const [id, marker, onboarded, rowExists, auto] of [
    ['legacy', false, false, true, false],
    ['legacy-no-row', false, false, false, false],
    ['confirmed-signup', true, false, true, true],
    ['returning', true, true, true, false]
  ]) {
    await fresh(390, 844, true);
    await evaluate(`window.savedOnboarding = [];
      window.PTCloud = { enabled:true, user:{ id:${JSON.stringify(id)}, user_metadata:${marker ? '{tracy_onboarding:1}' : '{}'} },
        row:${rowExists ? `{onboarded:${onboarded}, data:{pres:[],ses:[],notes:[],goals:[],nid:20}}` : 'null'},
        onboarded:${onboarded}, assessmentDone:false, ready:false,
        save(snapshot){window.savedOnboarding.push(this.onboarded);return Promise.resolve();} };
    `);
    await welcome(`${id}@example.test`);
    await enterDashboard({ auto });
    if (auto) {
      assert.equal(await evaluate('PTCloud.onboarded'), true, 'auto tour is remembered immediately');
      assert.ok((await evaluate('window.savedOnboarding')).includes(true), 'onboarding is saved without waiting for autosave');
      await endTour();
    }
    for (const view of ['dash', 'decks']) {
      await evaluate(`podium.ext.go(${JSON.stringify(view)});`);
      assert.doesNotMatch(await evaluate(`document.getElementById('view').textContent`), /Initial Presentation Assessment|We could not prepare your assessment/, `${id}: ${view} has no retired assessment module`);
    }
    await evaluate(`podium.ext.go('eval');`);
    assert.ok(await evaluate(`document.getElementById('eslide')?.textContent.trim()`), 'the current evaluation still displays its speaking slides');
    assert.equal(await evaluate(`!!document.getElementById('econsent')`), true, 'recording consent remains available');
    console.log(`PASS ${id}: ${auto ? 'automatic' : 'manual-only'} tour, retired module absent, speaking evaluation available`);
  }

  await fresh(320, 568);
  await welcome('cancel@example.test', true);
  await evaluate(`window.cancelledNavigation=0;podium.welcomeEnter(()=>window.cancelledNavigation++);podium.welcomeEnterCancel();`);
  assert.equal(await evaluate(`!!document.querySelector('#welcome-door')`), false, 'cancellation removes the overlay');
  await new Promise(r => setTimeout(r, 3000));
  assert.equal(await evaluate('window.cancelledNavigation'), 0, 'cancelled animations cannot navigate later');
  await welcome('skip@example.test', true);
  await evaluate(`document.getElementById('leval').click();`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await waitFor('!document.querySelector("#welcome-door") && podium.tourOn()', 'Escape skips to dashboard and tour');
  await endTour();
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS reduced motion, cloud onboarding persistence, cancellation, Escape and browser error checks');
} finally {
  socket?.close();
  chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(resolve, 1500).unref(); } });
  server.close();
  // profile was created above under the OS temporary directory; never derive a user path.
  if (resolve(profile).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) && profile.includes('presenttrack-onboarding-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
  }
}
