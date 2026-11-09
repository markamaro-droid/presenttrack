import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/browser-voice-session.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const recognizers = [], states = [], captions = [], calls = [], timers = new Map(); let count = 0;
  class Recognition {
    constructor() { recognizers.push(this); }
    start() { this.running = true; this.onstart?.(); }
    abort() { this.running = false; this.onend?.(); }
    stop() { this.running = false; this.onend?.(); }
    result(text) { const result = [{ transcript: text }]; result.isFinal = true; this.onresult?.({ results: [result] }); }
  }
  const synth = { getVoices: () => [], speak(u) { this.utterance = u; }, cancel() { this.cancelled = true; this.utterance?.onerror?.(); } };
  const context = { AbortController, navigator: { onLine: true }, setTimeout: (fn, ms) => { timers.set(++count, { fn, ms }); return count; }, clearTimeout: id => timers.delete(id) };
  vm.createContext(context); vm.runInContext(source, context);
  let owner = 'a';
  const session = new context.TracyBrowserVoiceSession({ tts: options.tts, Recognition, synth, canListen: options.canListen, getContext: options.getContext, Utterance: class { constructor(text) { this.text = text; } },
    getSession: async () => options.noAuth ? null : { user: { id: owner }, access_token: 'session-token' },
    fetchImpl: async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, init, body }); return options.fetcher ? options.fetcher(body) : new Response(JSON.stringify(body.action ? { ready: true } : { reply: 'Try a clear opening.' })); },
    onState: state => states.push(state), onCaption: (who, text) => captions.push({ who, text }) });
  return { session, recognizers, states, captions, calls, synth, timers, changeOwner: () => { owner = 'b'; },
    current: () => recognizers.at(-1), expire: ms => { const entry = [...timers.entries()].find(([, t]) => t.ms === ms); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); } };
}
test('browser voice alternates listening, authenticated Groq replies and synthesis without recording itself', async () => {
  const s = setup(); await s.session.start();
  assert.equal(s.session.state, 'listening'); assert.equal(s.calls[0].body.action, 'start');
  s.current().result('Help with my introduction'); await flush();
  assert.equal(s.session.state, 'speaking'); assert.equal(s.current().running, false);
  assert.equal(s.calls[1].url, '/api/coach'); assert.equal(s.calls[1].body.message, 'Help with my introduction');
  s.synth.utterance.onend(); assert.equal(s.session.state, 'listening');
  s.current().result('What comes next?'); await flush();
  assert.equal(s.calls[2].body.history.length, 2); assert.equal(s.session.state, 'speaking');
  s.session.stop(); assert.equal(s.session.active, false); assert.equal(s.timers.size, 0);
});

test('typed and spoken messages share bounded history across stop and restart; clear removes it', async () => {
  const s = setup({ getContext: () => ({ page: 'perf', metric: 'wpm' }) });
  s.session.muteSpeaker(true);
  assert.equal(await s.session.sendText('What is WPM?'), true);
  assert.equal(s.recognizers.length, 0);
  assert.equal(s.session.active, false);
  assert.equal(s.calls[0].body.context.page, 'perf');
  assert.equal(s.session.messages.length, 2);
  await s.session.start();
  s.current().result('Explain that again'); await flush();
  assert.equal(s.calls.at(-1).body.history.length, 2);
  s.session.stop();
  await s.session.sendText('And filler words?');
  assert.equal(s.calls.at(-1).body.history.length, 4);
  assert.equal(s.session.messages.length, 6);
  s.session.clear(); assert.equal(s.session.messages.length, 0); assert.equal(s.session.history.length, 0);
  assert.equal(s.timers.size, 0);
});

test('text chat works with no recognition or synthesis and selected device voice is honored', async () => {
  const s = setup(); s.session.Recognition = null; s.session.synth = null; s.session.Utterance = null;
  s.session.muteSpeaker(true); await s.session.sendText('Hello');
  assert.equal(s.session.messages.length, 2); assert.equal(s.recognizers.length, 0);
  const v = setup(); const selected = { voiceURI: 'device-1', lang: 'fil-PH' };
  v.synth.getVoices = () => [selected]; v.session.setVoice('device-1');
  await v.session.sendText('Kumusta?');
  assert.equal(v.synth.utterance.voice, selected);
  v.synth.utterance.onend(); assert.equal(v.session.active, false); assert.equal(v.recognizers.length, 0);
});

test('muting while natural voice loads cancels audio and ignores delayed playback callbacks', async () => {
  let clip;
  const s = setup({ tts: { speak(text, hooks) { return clip = { hooks, cancel() { this.cancelled = true; } }; } } });
  await s.session.sendText('Hello');
  assert.equal(s.session.state, 'thinking');
  s.session.muteSpeaker(true);
  assert.equal(clip.cancelled, true); assert.equal(s.session.active, false);
  clip.hooks.onstart(); clip.hooks.onend();
  assert.equal(s.session.state, 'idle'); assert.equal(s.recognizers.length, 0);
});

test('single-turn mode pauses after reply and capture lock prevents hands-free restart', async () => {
  let allowed = true; const s = setup({ canListen: () => allowed });
  s.session.setHandsFree(false); await s.session.start('taglish');
  assert.equal(s.current().lang, 'fil-PH');
  s.current().result('Kumusta'); await flush(); s.synth.utterance.onend();
  assert.equal(s.session.state, 'muted'); assert.equal(s.current().running, false);
  s.session.muteMicrophone(false); assert.equal(s.session.state, 'listening');
  s.session.setHandsFree(true); s.current().result('Another question'); await flush();
  allowed = false; s.synth.utterance.onend();
  assert.equal(s.session.active, false); assert.equal(s.current().running, false);
});

test('cancelling typed requests ignores late answers and does not activate recognition', async () => {
  let resolve; const s = setup({ fetcher: () => new Promise(r => { resolve = r; }) });
  const pending = s.session.sendText('Hello'); await flush();
  s.session.interrupt(); resolve(new Response('{"reply":"Too late"}')); await pending;
  assert.equal(s.session.active, false); assert.equal(s.session.messages.length, 1);
  assert.equal(s.recognizers.length, 0); assert.equal(s.timers.size, 0);
});
test('no sign-in means no microphone and no provider request', async () => {
  const s = setup({ noAuth: true }); await s.session.start();
  assert.equal(s.recognizers.length, 0); assert.equal(s.calls.length, 0); assert.match(s.states.at(-1).message, /sign in/);
});
test('mute, interruption, account changes and end cannot revive old recognition or responses', async () => {
  let resolve;
  const s = setup({ fetcher: body => body.action ? new Response('{"ready":true}') : new Promise(r => { resolve = r; }) });
  await s.session.start(); const old = s.current(); const oldResult = old.onresult;
  s.session.muteMicrophone(true); oldResult({ results: [] }); assert.equal(old.running, false);
  s.session.muteMicrophone(false); s.current().result('Hello'); await flush();
  assert.equal(s.session.state, 'thinking'); s.session.interrupt();
  resolve(new Response('{"reply":"Late reply"}')); await flush(); assert.equal(s.session.state, 'listening');
  assert.ok(!s.synth.utterance);
  s.changeOwner(); s.current().result('Different account'); await flush();
  assert.equal(s.session.active, false); assert.equal(s.calls.length, 2);
});
test('Groq limits and recognition failures release microphone and do not retry automatically', async () => {
  const s = setup({ fetcher: body => new Response(JSON.stringify(body.action ? { ready: true } : { error: 'groq_limit' }), { status: body.action ? 200 : 503, headers: { 'retry-after': '120' } }) });
  await s.session.start(); s.current().result('Help'); await flush();
  assert.match(s.states.at(-1).message, /Groq.*limit.*2 minute/); assert.equal(s.session.active, false); assert.equal(s.timers.size, 0);
  assert.equal(s.calls.length, 2);
  const r = setup(); await r.session.start(); r.current().onerror({ error: 'not-allowed' });
  assert.match(r.states.at(-1).message, /blocked/); assert.equal(r.current().running, false);
});
test('blocked synthesis can be resumed by gesture, and muted microphone stays off after speech', async () => {
  const s = setup(); await s.session.start(); s.current().result('Hello'); await flush();
  s.synth.utterance.onerror(); assert.equal(s.session.state, 'playback');
  s.session.enablePlayback(); assert.equal(s.session.state, 'speaking');
  s.session.muteMicrophone(true); s.synth.utterance.onend();
  assert.equal(s.session.state, 'muted'); assert.equal(s.current().running, false);
  s.session.stop(); assert.equal(s.timers.size, 0);
});
test('setup, idle and duration timeouts close the session', async () => {
  for (const ms of [90000, 600000]) {
    const s = setup(); await s.session.start(); s.expire(ms);
    assert.equal(s.session.active, false); assert.equal(s.current().running, false); assert.equal(s.timers.size, 0);
  }
  const s = setup({ fetcher: () => new Promise(() => {}) }); s.session.start(); await flush(); s.expire(55000);
  assert.equal(s.session.active, false); assert.equal(s.recognizers.length, 0);
});

test('Cartesia playback keeps microphone paused; interruption and failure never change voice', async () => {
  const clips = [];
  const tts = { speak(text, hooks) { const clip = { hooks, cancelled: false, cancel() { this.cancelled = true; } }; clips.push(clip); return clip; } };
  const s = setup({ tts }); await s.session.start();
  s.current().result('Hello'); await flush();
  assert.equal(s.session.state, 'thinking');
  clips[0].hooks.onstart();
  assert.equal(s.session.state, 'speaking'); assert.equal(s.current().running, false);
  assert.equal(s.synth.utterance, undefined);
  s.session.interrupt(); assert.equal(clips[0].cancelled, true);
  clips[0].hooks.onend(); assert.equal(s.session.state, 'listening');
  s.current().result('Again'); await flush();
  clips[1].hooks.onerror(); assert.equal(s.session.state, 'playback');
  assert.equal(s.current().running, false); assert.equal(s.synth.utterance, undefined);
  s.session.enablePlayback(); s.session.muteMicrophone(true);
  clips[2].hooks.onend(); assert.equal(s.session.state, 'muted');
  s.session.stop();
});
