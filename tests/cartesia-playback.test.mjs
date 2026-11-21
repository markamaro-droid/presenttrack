import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/cartesia-speech.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(fetcher, options = {}) {
  const clips = [], requests = [], revoked = [];
  class Audio {
    constructor() { clips.push(this); }
    play() { if (options.blocked?.()) return Promise.reject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' })); this.playing = true; this.onplaying?.(); return Promise.resolve(); }
    pause() { this.playing = false; }
    removeAttribute() {}
  }
  const context = { AbortController, Uint8Array, Blob, atob, setTimeout, clearTimeout, Audio,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) }, addEventListener() {},
    PTCloud: { user: { id: 'alice' }, client: { auth: { getSession: async () => ({ data: { session: { user: { id: 'alice' }, access_token: 'test-token' } } }) } } },
    fetch: async (...args) => { requests.push(args); return fetcher ? fetcher(...args) : new Response(JSON.stringify({ audio: Buffer.from('RIFFtest').toString('base64') })); }
  };
  if (options.device) {
    context.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    context.speechSynthesis = { utterance: null, spoken: [], speak(u) { this.utterance = u; this.spoken.push(u.text); u.onstart?.(); }, cancel() { this.cancelled = true; }, pause() { this.paused = true; }, resume() { this.paused = false; } };
  }
  vm.createContext(context); vm.runInContext(source, context);
  return { audio: context.TracyAudio, context, clips, requests, revoked };
}
test('Cartesia player pauses, resumes, cleans up and reuses cached narration', async () => {
  const s = setup(); let ended = 0;
  s.audio.speak('Hello Tracy.', { onend: () => ended++ }); await flush();
  assert.equal(s.clips[0].playing, true);
  s.audio.pause(true); assert.equal(s.clips[0].playing, false);
  s.audio.pause(false); assert.equal(s.clips[0].playing, true);
  s.clips[0].onended(); await flush(); assert.equal(ended, 1);
  assert.equal(s.revoked.length, 1);
  s.audio.speak('Hello Tracy.'); await flush(); assert.equal(s.requests.length, 1);
  s.audio.cancel(); assert.equal(s.clips.length, 1); assert.equal(s.clips[0].playing, false);
});
test('cancelled request cannot play late audio or invoke completion', async () => {
  let resolve; const s = setup(() => new Promise(r => { resolve = r; })); let ended = false;
  s.audio.speak('Hello.', { onend: () => { ended = true; } }); await flush();
  s.audio.cancel(); resolve(new Response(JSON.stringify({ audio: 'UklGRg==' }))); await flush();
  assert.equal(s.clips.length, 0); assert.equal(ended, false);
});
test('failed voice request calls error without another provider or microphone', async () => {
  const s = setup(() => new Response('{}', { status: 429 })); let failed = false;
  s.audio.speak('Hello.', { onerror: () => { failed = true; } }); await flush();
  assert.equal(failed, true); assert.equal(s.requests.length, 1); assert.equal(s.clips.length, 0);
});
test('preparing and speaking share one request without premature playback', async () => {
  let resolve;
  const s = setup(() => new Promise(r => { resolve = r; }));
  const prepared = s.audio.prepare('Next tour step.'); await flush();
  assert.equal(s.clips.length, 0);
  s.audio.speak('Next tour step.'); await flush();
  assert.equal(s.requests.length, 1);
  resolve(new Response(JSON.stringify({ audio: Buffer.from('RIFFtest').toString('base64') })));
  assert.equal(await prepared, true); await flush();
  assert.equal(s.clips.length, 1); assert.equal(s.clips[0].playing, true);
  s.audio.cancel();
});
test('normal tour clips above the former 500 KB threshold stay cached', async () => {
  const s = setup(() => new Response(JSON.stringify({ audio: Buffer.alloc(400000).toString('base64') })));
  assert.equal(await s.audio.prepare('A longer instruction.'), true);
  s.audio.speak('A longer instruction.'); await flush();
  assert.equal(s.requests.length, 1);
  s.audio.cancel();
});

test('animation callbacks follow actual playback, buffering, resume and end', async () => {
  let resolve; const s = setup(() => new Promise(r => { resolve = r; }));
  const events = [];
  s.audio.speak('Welcome.', { onstart: () => events.push('playing'), onpause: () => events.push('paused'), onend: () => events.push('ended') });
  await flush(); assert.deepEqual(events, []);
  resolve(new Response(JSON.stringify({ audio: 'UklGRg==' }))); await flush();
  assert.deepEqual(events, ['playing']);
  s.clips[0].onwaiting(); s.clips[0].onplaying(); s.clips[0].onpause();
  assert.deepEqual(events, ['playing','paused','playing','paused']);
  s.clips[0].onended(); await flush();
  assert.deepEqual(events.slice(-2), ['paused','ended']);
  assert.equal(s.clips[0].onplaying, null);
});

test('login gesture primes audio without a provider request, then greeting reuses that element', async () => {
  const s = setup();
  assert.equal(await s.audio.unlock(), true);
  assert.equal(s.requests.length, 0);
  assert.equal(s.clips.length, 1);
  assert.match(s.clips[0].src, /^data:audio\/wav/);
  let started = 0;
  s.audio.speak('Welcome to PresentTrack!', { onstart: () => started++ });
  await flush();
  assert.equal(s.clips.length, 1);
  assert.equal(s.clips[0].src, 'blob:test');
  assert.equal(started, 1);
  s.audio.cancel();
});

test('fixed doorway narration plays persisted audio with real playback callbacks and no request', async () => {
  const s=setup(),events=[];
  s.context.PTWelcomeDoorSpeech={text:'Fixed doorway narration',read:async()=>({audio:'UklGRg==',mime:'audio/wav'}),write:async()=>{}};
  s.audio.speak(s.context.PTWelcomeDoorSpeech.text,{onstart:()=>events.push('started'),onend:()=>events.push('ended')});
  await flush();
  assert.equal(s.requests.length,0);
  assert.equal(s.clips.length,1);assert.equal(s.clips[0].playing,true);
  assert.deepEqual(events,['started']);
  s.clips[0].onended();await flush();
  assert.deepEqual(events,['started','ended']);assert.equal(s.clips[0].playing,false);
});

test('exhausted natural credits use device speech, report the fallback and suppress repeated provider attempts', async () => {
  const s = setup(() => new Response(JSON.stringify({ error: 'speech_credits' }), { status: 503 }), { device: true });
  const events = []; let ended = 0;
  s.audio.speak('Hello from Tracy.', { onfallback: value => events.push(value), onstart: value => events.push(value), onend: () => ended++ }); await flush();
  assert.equal(s.context.speechSynthesis.utterance.text, 'Hello from Tracy.');
  assert.equal(events[0].reason, 'speech_credits'); assert.equal(events[1].source, 'device');
  s.audio.pause(true); assert.equal(s.context.speechSynthesis.paused, true);
  s.audio.pause(false); assert.equal(s.context.speechSynthesis.paused, false);
  s.context.speechSynthesis.utterance.onend(); assert.equal(ended, 1);
  s.audio.speak('Next guide step.'); await flush();
  assert.equal(s.context.speechSynthesis.utterance.text, 'Next guide step.');
  assert.equal(s.requests.length, 1, 'Do not retry an exhausted provider for every guide step');
  s.audio.cancel(); assert.equal(s.context.speechSynthesis.cancelled, true);
});

test('Enable audio retries the loaded clip inside the gesture without downloading or regenerating it', async () => {
  let blocked = true;
  const s = setup(null, { blocked: () => blocked, device: true }); const events = [];
  const handle = s.audio.speak('A saved reply.', { onerror: e => events.push(e.code), onstart: () => events.push('playing') }); await flush();
  assert.deepEqual(events, ['playback_blocked']); assert.equal(s.context.speechSynthesis.spoken.length, 0);
  assert.equal(s.revoked.length, 0, 'Keep loaded audio for a user gesture');
  blocked = false;
  assert.equal(handle.retry(), true); assert.equal(s.clips[0].playing, true, 'play() is called synchronously');
  assert.equal(s.requests.length, 1); assert.deepEqual(events, ['playback_blocked', 'playing']);
  s.audio.cancel(); assert.equal(handle.retry(), false);
});

test('device fallback cannot speak an old account reply or a cancelled reply', async () => {
  for (const cancel of [false, true]) {
    let resolve;
    const s = setup(() => new Promise(r => { resolve = r; }), { device: true });
    s.audio.speak('Private reply.'); await flush();
    if (cancel) s.audio.cancel(); else s.context.PTCloud.user.id = 'bob';
    resolve(new Response(JSON.stringify({ error: 'speech_credits' }), { status: 503 })); await flush();
    assert.equal(s.context.speechSynthesis.spoken.length, 0);
    s.audio.cancel();
  }
});

test('a mid-reply provider failure speaks only the remaining text using device voice', async () => {
  let requests = 0;
  const s = setup(() => ++requests === 1 ? new Response(JSON.stringify({ audio: 'UklGRg==' })) : new Response(JSON.stringify({ error: 'speech_credits' }), { status: 503 }), { device: true });
  s.audio.speak('First sentence. '.repeat(57) + 'Final sentence.'); await flush();
  assert.equal(s.context.speechSynthesis.spoken.length, 0);
  s.clips[0].onended(); await flush();
  assert.ok(s.context.speechSynthesis.utterance.text.endsWith('Final sentence.'));
  assert.ok(s.context.speechSynthesis.utterance.text.length < 100, 'Do not repeat the played first chunk');
  s.audio.cancel();
});

test('a browser without device speech gets the underlying credit error instead of an autoplay claim', async () => {
  const s = setup(() => new Response(JSON.stringify({ error: 'speech_credits' }), { status: 503 })); let error;
  s.audio.speak('Hello.', { onerror: e => { error = e; } }); await flush();
  assert.equal(error.code, 'device_voice_unavailable'); assert.equal(error.cause, 'speech_credits');
});

test('tour narration never falls back to device speech when Cartesia fails', async () => {
 for (const code of ['speech_credits','speech_unavailable','speech_access']) {
  const s=setup(()=>Response.json({error:code},{status:503}),{device:true});const errors=[];
  s.audio.speak('This is the highlighted control.',{allowDeviceFallback:false,onerror:e=>errors.push(e.code)});
  await flush();assert.deepEqual(errors,[code]);assert.deepEqual(s.context.speechSynthesis.spoken,[]);
  s.audio.cancel();
 }
});
