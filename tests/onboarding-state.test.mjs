import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../js/dashboard.js', import.meta.url), 'utf8');
const cloudSource = await readFile(new URL('../js/cloud.js', import.meta.url), 'utf8');

function setup({ enabled = true, id = 'alice', marker, row = null, assessmentDone = false, storage = new Map(), storageFails = false } = {}) {
  const writes = [];
  const cloud = {
    enabled, user: { id, user_metadata: marker === undefined ? {} : { tracy_onboarding: marker } },
    row, assessmentDone, onboarded: false,
    save(snapshot) { writes.push({ onboarded: this.onboarded, snapshot }); }
  };
  const context = {
    window: { PTCloud: cloud }, PTCloud: cloud, podium: {},
    localStorage: {
      getItem(key) { if (storageFails) throw Error('Storage unavailable'); return storage.get(key); },
      setItem(key, value) { if (storageFails) throw Error('Storage unavailable'); storage.set(key, value); }
    }
  };
  const stateSource = dashboard.slice(dashboard.indexOf('const S='), dashboard.indexOf('const fsize='));
  const gateStart = dashboard.indexOf('const pendingEval=');
  const gateSource = dashboard.slice(gateStart, dashboard.indexOf('\n', gateStart));
  vm.createContext(context);
  vm.runInContext(stateSource + '\n' + gateSource + '\nglobalThis.state = S; globalThis.consume = consumeOnboarding; globalThis.pending = pendingEval;', context);
  const login = (registered = false, email = 'student@example.test') => {
    context.state.u.email = email;
    context.podium.account(email, registered);
  };
  return { ...context, context, cloud, writes, storage, login };
}

test('successful registration is eligible even before the cloud row is loaded', () => {
  const s = setup();
  s.login(true);
  assert.equal(s.state.isNew, true);
  assert.equal(s.state.guide, true);
  assert.equal(s.state.toured, false);
  assert.equal(s.cloud.ready, true);
  assert.equal(s.pending(), true);
  assert.equal(s.writes.length, 0, 'logging in does not consume a tour that has not started');
});

test('legacy accounts never auto-tour, including missing rows and incomplete old onboarding', () => {
  for (const row of [null, { onboarded: false, data: {} }, { onboarded: true, data: {} }]) {
    const s = setup({ row, assessmentDone: true });
    s.login();
    assert.equal(s.state.isNew, false);
    assert.equal(s.state.guide, false);
    assert.equal(s.pending(), false);
  }
});

test('email-confirmed first login uses the durable signup marker without a registration flag', () => {
  const s = setup({ marker: 1, row: { onboarded: false, data: {} } });
  s.login(false);
  assert.equal(s.state.isNew, true);
  assert.equal(s.state.toured, false);
  assert.equal(s.pending(), true);
});

test('cloud completion suppresses the tour on another device without a local receipt', () => {
  const s = setup({ marker: 1, row: { onboarded: true, data: {} } });
  s.login();
  assert.equal(s.storage.size, 0);
  assert.equal(s.state.isNew, false);
  assert.equal(s.state.toured, true);
  assert.equal(s.cloud.onboarded, true);
});

test('starting onboarding saves immediately without unlocking the server evaluation gate', () => {
  const s = setup({ marker: 1, row: { onboarded: false, data: {} } });
  s.login();
  s.state.ev = { done: true };
  s.consume();
  assert.equal(s.writes.length, 1);
  assert.equal(s.writes[0].onboarded, true);
  assert.equal(s.state.isNew, false);
  assert.equal(s.state.toured, true);
  assert.equal(s.state.evalRequired, true);
  assert.equal(s.state.assessRequired, true);
  assert.equal(s.cloud.assessmentDone, false);
  assert.equal(s.pending(), true, 'a client-side evaluation object cannot bypass the gate');
  s.login();
  assert.equal(s.state.isNew, false, 'an interrupted tour is consumed before the next cloud read');
});

test('local receipts are scoped by account id and survive a fresh page session', () => {
  const storage = new Map();
  const alice = setup({ marker: 1, id: 'alice', storage });
  alice.login(); alice.consume();
  const returning = setup({ marker: 1, id: 'alice', storage });
  returning.login();
  assert.equal(returning.state.isNew, false);
  const bob = setup({ marker: 1, id: 'bob', storage });
  bob.login();
  assert.equal(bob.state.isNew, true, 'the same email in a different account must not inherit a receipt');
  assert.equal(bob.cloud.onboarded, false);
});

test('unavailable browser storage still allows onboarding and immediate cloud persistence', () => {
  const s = setup({ marker: 1, storageFails: true });
  s.login();
  assert.equal(s.state.isNew, true);
  assert.doesNotThrow(() => s.consume());
  assert.equal(s.writes.length, 1);
  assert.equal(s.writes[0].onboarded, true);
});

test('demo registration is consumed once while existing demo logins stay manual', () => {
  const s = setup({ enabled: false });
  s.login(true, 'new@example.test');
  assert.equal(s.state.isNew, true);
  s.consume();
  s.login(false, 'new@example.test');
  assert.equal(s.state.isNew, false);
  assert.equal(s.state.toured, true);
  assert.equal(s.pending(), true);
  s.login(false, 'existing@example.test');
  assert.equal(s.state.isNew, false);
  assert.equal(s.state.guide, false);
});

test('returning users can manually start the real tour, and repeat clicks do not restart it', () => {
  const s = setup({ marker: 1, row: { onboarded: true, data: {} } });
  s.login();
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, classList: { add() {}, remove() {} }, querySelector: () => ({ focus() {} }) });
    return elements.get(id);
  };
  let shown = 0;
  Object.assign(s.context, {
    T: { on: false }, $: get, tourEl: () => get('tour'),
    document: { body: get('body') }, clearTimeout() {}, clearInterval() {}, setInterval() { return 1; },
    tourSteps: () => [{ view: 'dash' }], closePops() {}, setMin() {}, tourTick() {}, syncGuide() {}, tourShow() { shown++; }
  });
  vm.runInContext(dashboard.slice(dashboard.indexOf('function startTour(){'), dashboard.indexOf('function endTour(')), s.context);
  s.context.startTour();
  s.context.startTour();
  assert.equal(s.context.T.on, true);
  assert.equal(shown, 1);
  assert.equal(s.writes.length, 1);
});

function signupClient(confirm) {
  const requests = [];
  const sb = { auth: {
    async signUp(request) {
      requests.push(request);
      return { data: { user: { id: 'signup', email: request.email, identities: [{}], user_metadata: request.options.data }, session: confirm ? null : {} }, error: null };
    },
    onAuthStateChange() {}
  } };
  const context = {
    window: { PT_SUPABASE: { url: 'https://example.supabase.co', anonKey: 'test' }, supabase: { createClient: () => sb } },
    document: { addEventListener() {}, querySelectorAll: () => [] }, setInterval() {}
  };
  vm.runInNewContext(cloudSource, context);
  return { cloud: context.window.PTCloud, requests };
}

test('signup stores the onboarding marker for both immediate and email-confirmation sessions', async () => {
  for (const confirm of [false, true]) {
    const s = signupClient(confirm);
    const result = await s.cloud.signUp('Alex Rivera', 'alex@example.test', 'not-a-real-password');
    assert.equal(s.requests.length, 1);
    assert.equal(s.requests[0].options.data.full_name, 'Alex Rivera');
    assert.equal(s.requests[0].options.data.tracy_onboarding, 1);
    if (confirm) assert.equal(result.confirm, true);
    else {
      assert.equal(result.name, 'Alex Rivera');
      assert.equal(s.cloud.user.user_metadata.tracy_onboarding, 1);
    }
  }
});
