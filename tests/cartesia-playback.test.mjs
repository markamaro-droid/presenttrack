import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/cartesia-speech.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(fetcher) {
  const clips = [], requests = [], revoked = [];
  class Audio {
    constructor() { clips.push(this); }
    play() { this.playing = true; this.onplaying?.(); return Promise.resolve(); }
    pause() { this.playing = false; }
    removeAttribute() {}
  }
  const context = { AbortController, Uint8Array, Blob, atob, setTimeout, clearTimeout, Audio,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) }, addEventListener() {},
    PTCloud: { user: { id: 'alice' }, client: { auth: { getSession: async () => ({ data: { session: { user: { id: 'alice' }, access_token: 'test-token' } } }) } } },
    fetch: async (...args) => { requests.push(args); return fetcher ? fetcher(...args) : new Response(JSON.stringify({ audio: Buffer.from('RIFFtest').toString('base64') })); }
  };
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
  s.audio.cancel(); assert.equal(s.clips[1].playing, false);
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
