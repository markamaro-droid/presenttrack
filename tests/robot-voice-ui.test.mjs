import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/robot-voice.js', import.meta.url), 'utf8');
function setup() {
  const items = new Map(), events = {}, documentEvents = {};
  const el = id => {
    if (!items.has(id)) items.set(id, { hidden: true, value: 'marin', textContent: '', dataset: {}, events: {}, attrs: {}, checked: true,
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }, focus() { this.focused = true; } });
    return items.get(id);
  };
  let session, auth, mutation;
  class FakeSession {
    constructor(options) { this.options = options; this.active = false; session = this; }
    async start() { this.active = true; this.state = 'connecting'; this.options.onState({ state: this.state, active: true, micMuted: false, message: 'Connecting' }); await this.options.getSession(); }
    stop(message) { this.active = false; this.state = 'idle'; this.options.onCaption('user', ''); this.options.onCaption('assistant', ''); this.options.onState({ state: 'idle', active: false, message: message || 'Ended' }); }
    fail(message) { this.stop(message); }
    muteSpeaker() {}
    interrupt() {}
  }
  const window = { PTCloud: { enabled: true, user: { id: 'a' }, client: { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'a' }, access_token: 'token' } } }), onAuthStateChange: fn => { auth = fn; }
  } } }, podium: { ext: { S: { view: 'dash' } } }, addEventListener: (name, fn) => { events[name] = fn; } };
  const document = { hidden: false, getElementById: el, addEventListener: (name, fn) => { documentEvents[name] = fn; } };
  vm.runInNewContext(source, { window, document, TracyBrowserVoiceSession: FakeSession, MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} } });
  return { ui: window.PTVoice, el, window, document, events, documentEvents, auth: (...args) => auth(...args), mutation: () => mutation(), get session() { return session; } };
}

test('sign out or account change closes controls, ends capture and clears captions', async () => {
  for (const next of [null, { user: { id: 'b' } }]) {
    const app = setup(); await app.ui.start();
    app.session.options.onCaption('user', 'Private words');
    app.auth('SIGNED_IN', next);
    assert.equal(app.session.active, false); assert.equal(app.el('tracy-voice').hidden, true);
    assert.equal(app.el('tracy-user-caption').textContent, '');
  }
});

test('tab hidden, page exit, minimize and network loss all stop capture', async () => {
  for (const action of ['hidden', 'exit', 'minimize', 'offline']) {
    const app = setup(); await app.ui.start();
    if (action === 'hidden') { app.document.hidden = true; app.documentEvents.visibilitychange(); }
    if (action === 'exit') app.events.pagehide();
    if (action === 'minimize') { app.el('bot').hidden = true; app.mutation(); }
    if (action === 'offline') app.events.offline();
    assert.equal(app.session.active, false);
  }
});

test('Tracy cannot start capturing on an evaluation page', async () => {
  const app = setup(); app.window.podium.ext.S.view = 'eval'; await app.ui.start();
  assert.equal(app.session.active, false); assert.match(app.el('tracy-status').textContent, /Finish your evaluation/);
});

test('captions use textContent and microphone light reflects mute state', async () => {
  const app = setup(); await app.ui.start();
  app.session.options.onCaption('assistant', '<img onerror="bad">');
  assert.equal(app.el('tracy-reply-caption').textContent, 'Tracy: <img onerror="bad">');
  app.session.options.onState({ state: 'speaking', active: true, micMuted: true, message: 'Speaking' });
  assert.equal(app.el('tracy-voice').dataset.mic, 'off');
  app.session.options.onState({ state: 'listening', active: true, micMuted: false, message: 'Listening' });
  assert.equal(app.el('tracy-voice').dataset.mic, 'on');
});

test('opening focuses the panel, Escape closes and restores robot focus', () => {
  const app = setup();
  app.ui.open();
  assert.equal(app.el('tracy-voice').hidden, false);
  assert.equal(app.el('tracy-voice').scrollTop, 0);
  assert.equal(app.el('tracy-voice').focused, true);
  app.el('tracy-voice').events.keydown({ key: 'Escape', stopPropagation() {} });
  assert.equal(app.el('tracy-voice').hidden, true);
  assert.equal(app.el('bc').focused, true);
  assert.equal(app.el('bvoice').attrs['aria-expanded'], 'false');
});

test('conversation bubble toggles closed and stops active capture on the second click', async () => {
  const app = setup();
  app.el('bvoice').events.click();
  assert.equal(app.el('tracy-voice').hidden, false);
  assert.equal(app.el('bvoice').attrs['aria-expanded'], 'true');
  await app.ui.start();
  app.el('bvoice').events.click();
  assert.equal(app.el('tracy-voice').hidden, true);
  assert.equal(app.session.active, false);
  assert.equal(app.el('bvoice').attrs['aria-expanded'], 'false');
  app.el('bvoice').events.click();
  assert.equal(app.el('tracy-voice').hidden, false);
  assert.equal(app.session.active, false);
});

test('minimizing closes an idle conversation so it cannot reappear unexpectedly', () => {
  const app = setup(); app.ui.open(); app.el('bot').hidden = true;
  app.mutation();
  assert.equal(app.el('tracy-voice').hidden, true);
  assert.equal(app.el('bvoice').attrs['aria-expanded'], 'false');
});
