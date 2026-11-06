import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/robot-chat.js', import.meta.url), 'utf8');
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(fetcher, sessionFn) {
  class Element {
    constructor() { this.children = []; this.hidden = true; this.value = ''; this.attrs = {}; this.events = {}; this.textContent = ''; this.scrollHeight = 500; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attrs[name] = value; }
    appendChild(item) { this.children.push(item); item.parent = this; }
    replaceChildren() { this.children = []; }
    get firstElementChild() { return this.children[0]; }
    remove() { this.parent.children.shift(); }
    focus() { this.focused = true; }
  }
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  let authEvent;
  const session = { user: { id: 'user-a' }, access_token: 'user-a-token' };
  const cloud = { enabled: true, user: { id: 'user-a' }, client: { auth: {
    getSession: sessionFn || (async () => ({ data: { session } })),
    onAuthStateChange: fn => { authEvent = fn; }
  } } };
  const window = { PTCloud: cloud, podium: {} };
  const calls = [];
  vm.runInNewContext(source, { window, document: { getElementById: el, createElement: () => new Element() }, location: { protocol: 'http:' },
    fetch: async (...args) => { calls.push(args); return fetcher(...args); }, AbortController, setTimeout, clearTimeout, TypeError, SyntaxError });
  return { chat: window.PTRobotChat, el, calls, cloud, auth: (...args) => authEvent(...args) };
}
const reply = text => new Response(JSON.stringify({ reply: text }), { status: 200 });

test('typing, duplicate lock, safe text rendering, scroll and multi-turn context', async () => {
  const request = defer(); let first = true;
  const ui = setup(() => first ? (first = false, request.promise) : reply('Follow-up'));
  const sending = ui.chat.send('<img src=x onerror=alert(1)>');
  await flush();
  assert.equal(ui.chat.busy, true);
  assert.equal(ui.el('robot-chat-send').disabled, true);
  assert.match(ui.el('robot-chat-status').textContent, /typing/);
  await ui.chat.send('duplicate');
  assert.equal(ui.calls.length, 1);
  request.resolve(reply('<script>untrusted</script>'));
  await sending;
  assert.equal(ui.chat.busy, false);
  assert.equal(ui.el('robot-chat-input').disabled, false);
  assert.equal(ui.el('robot-chat-log').children[1].textContent, 'PresentTrack AI: <script>untrusted</script>');
  assert.equal(ui.el('robot-chat-log').scrollTop, 500);
  await ui.chat.send('Explain that');
  const payload = JSON.parse(ui.calls[1][1].body);
  assert.deepEqual(payload.history.map(x => x.role), ['user', 'assistant']);
  assert.deepEqual(Object.keys(payload).sort(), ['history', 'message']);
  assert.equal(ui.calls[0][1].headers.Authorization, 'Bearer user-a-token');
});

test('duplicate sends are blocked while session refresh is pending', async () => {
  const session = defer();
  const ui = setup(() => reply('Hello'), () => session.promise);
  const sending = ui.chat.send('Hello');
  await ui.chat.send('Again');
  session.resolve({ data: { session: { user: { id: 'user-a' }, access_token: 'token' } } });
  await sending;
  assert.equal(ui.calls.length, 1);
});

test('failure restores input and does not poison history; retry is possible', async () => {
  let count = 0;
  const ui = setup(() => ++count === 1 ? new Response('private upstream error', { status: 503 }) : reply('Recovered'));
  await ui.chat.send('Help me prepare');
  assert.equal(ui.el('robot-chat-input').value, 'Help me prepare');
  assert.match(ui.el('robot-chat-status').textContent, /temporarily unavailable/);
  assert.equal(ui.chat.busy, false);
  await ui.chat.send('Help me prepare');
  assert.deepEqual(JSON.parse(ui.calls[1][1].body).history, []);
});

test('rate limit is friendly and empty/long messages never call the API', async () => {
  const ui = setup(() => new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }));
  await ui.chat.send(''); await ui.chat.send('x'.repeat(2001));
  assert.equal(ui.calls.length, 0);
  await ui.chat.send('Hello');
  assert.match(ui.el('robot-chat-status').textContent, /2 minute/);
});

test('sign out aborts a request, clears the transcript and ignores a late reply', async () => {
  const request = defer();
  const ui = setup(() => request.promise);
  const sending = ui.chat.send('Private question'); await flush();
  ui.cloud.user = null; ui.auth('SIGNED_OUT', null);
  assert.equal(ui.calls[0][1].signal.aborted, true);
  request.resolve(reply('Private answer')); await sending;
  assert.equal(ui.el('robot-chat-log').children.length, 0);
  assert.equal(ui.el('robot-chat').hidden, true);
});

test('new chat cancels stale work and the next message has no prior context', async () => {
  const request = defer(); let first = true;
  const ui = setup(() => first ? (first = false, request.promise) : reply('Fresh answer'));
  const old = ui.chat.send('Old'); await flush();
  ui.chat.reset();
  await ui.chat.send('Fresh');
  request.resolve(reply('Stale')); await old;
  assert.deepEqual(JSON.parse(ui.calls[1][1].body).history, []);
  assert.equal(ui.el('robot-chat-log').children.length, 2);
  assert.equal(ui.el('robot-chat-log').children[1].textContent, 'PresentTrack AI: Fresh answer');
});

test('history stays within turn and character bounds', async () => {
  const ui = setup(() => reply('x'.repeat(6000)));
  for (let i = 0; i < 10; i++) await ui.chat.send('q'.repeat(2000));
  for (const [, options] of ui.calls) {
    const body = JSON.parse(options.body);
    assert.ok(body.history.length <= 12);
    assert.ok(body.history.reduce((n, t) => n + t.content.length, body.message.length) <= 16000);
  }
});

test('local tour/navigation commands remain local', async () => {
  const ui = setup(() => assert.fail('Local navigation must not reach AI'));
  ui.cloud.enabled = false; ui.cloud.user = null;
  ui.chat.setHooks({ command: () => ({ say: 'Starting the guided tour.', tour: true, quiet: true }) });
  await ui.chat.send('Guide me');
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.el('robot-chat').hidden, true);
});

test('account switch clears previous context before the next request', async () => {
  const ui = setup(() => reply('Hello'));
  await ui.chat.send('User A private question');
  ui.cloud.user = { id: 'user-b' };
  ui.auth('SIGNED_IN', { user: { id: 'user-b' } });
  ui.cloud.client.auth.getSession = async () => ({ data: { session: { user: { id: 'user-b' }, access_token: 'user-b-token' } } });
  await ui.chat.send('User B question');
  assert.deepEqual(JSON.parse(ui.calls[1][1].body).history, []);
  assert.equal(ui.calls[1][1].headers.Authorization, 'Bearer user-b-token');
  assert.equal(ui.el('robot-chat-log').children.length, 2);
});

test('reset releases a send even when session refresh never resolves', async () => {
  const ui = setup(() => assert.fail('Cancelled session cannot send'), () => new Promise(() => {}));
  const sending = ui.chat.send('Hello');
  ui.chat.reset();
  await sending;
  assert.equal(ui.chat.busy, false);
});
