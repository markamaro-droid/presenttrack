import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code=await readFile(new URL('../js/practice-audio.js',import.meta.url),'utf8');
function setup(deferred=false){
  let grant,stops=0;
  const stream={getTracks:()=>[{stop(){stops++}}]};
  class Recorder {
    static isTypeSupported(){return true}
    constructor(){this.state='inactive';this.mimeType='audio/webm'}
    start(){this.state='recording'} pause(){this.state='paused'} resume(){this.state='recording'}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['sound'],{type:'audio/webm'})});this.onstop?.()}
  }
  const window={MediaRecorder:Recorder};
  const context={window,MediaRecorder:Recorder,Blob,navigator:{mediaDevices:{getUserMedia:()=>deferred?new Promise(r=>grant=r):Promise.resolve(stream)}},addEventListener(){}};
  vm.runInNewContext(code,context);
  return {capture:new window.PTPracticeAudio.Capture(),get capturing(){return window.PTPracticeAudio.capturing},get stops(){return stops},grant:()=>grant(stream)};
}
test('practice capture pauses, resumes, retains retry audio and stops the microphone',async()=>{
  const s=setup();await s.capture.start();s.capture.pause();assert.equal(s.capture.recorder.state,'paused');await s.capture.start();assert.equal(s.capture.recorder.state,'recording');
  const blob=await s.capture.finish();assert.equal(blob.size,5);assert.equal(await s.capture.finish(),blob);assert.equal(s.stops,1);s.capture.dispose();assert.equal(s.capture.blob,null);
});
test('navigation before microphone permission resolves releases the late stream',async()=>{
  const s=setup(true);const pending=s.capture.start();s.capture.dispose();s.grant();await assert.rejects(pending,/cancelled/);assert.equal(s.stops,1);
});

test('capture lock covers permission, recording and pause and releases on finish or navigation', async () => {
  const s = setup(true), pending = s.capture.start();
  assert.equal(s.capturing, true); s.grant(); await pending;
  assert.equal(s.capturing, true); s.capture.pause(); assert.equal(s.capturing, true);
  await s.capture.finish(); assert.equal(s.capturing, false);
  const cancelled = setup(true), late = cancelled.capture.start(); cancelled.capture.dispose();
  assert.equal(cancelled.capturing, false); cancelled.grant(); await assert.rejects(late);
});

function uploadSetup({ fail = false, signal } = {}) {
  const calls = [], session = { data: { session: { access_token: 'token', user: { id: 'account' } } } };
  const bucket = { upload: async (path, blob) => { calls.push(['upload', path, blob.size]); return {}; }, remove: async paths => { calls.push(['remove', paths]); return {}; } };
  const window = { PTCloud: { client: { auth: { getSession: async () => session }, storage: { from: () => bucket } } } };
  vm.runInNewContext(code, { window, Blob, Uint8Array, crypto: { randomUUID: () => 'unique' }, btoa: s => Buffer.from(s, 'binary').toString('base64'), addEventListener() {},
    fetch: async (url, options) => { calls.push(['request', JSON.parse(options.body)]); if (fail) throw new Error('offline'); return { ok: true, json: async () => ({ score: 80 }) }; }
  });
  return { calls, analyze: (blob,presentation) => window.PTPracticeAudio.analyze(blob, 120, signal,undefined,presentation) };
}
test('large browser uploads send a storage reference and clean up on success and failure', async () => {
  for (const fail of [false, true]) {
    const s = uploadSetup({ fail }), work = s.analyze(new Blob([new Uint8Array(3000001)], { type: 'audio/wav' }));
    if (fail) await assert.rejects(work, /offline/); else assert.equal((await work).score, 80);
    assert.equal(s.calls[0][0], 'upload');
    assert.equal(s.calls[1][1].storagePath, 'account/unique');
    assert.equal(s.calls[1][1].audio, undefined);
    assert.equal(s.calls.at(-1)[0], 'remove');
  }
});
test('small recordings stay inline; oversized and cancelled files do not upload', async () => {
  const s = uploadSetup(); await s.analyze(new Blob(['audio'], { type: 'audio/webm' }));
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0][1].audio, Buffer.from('audio').toString('base64'));
  const large = uploadSetup(); await assert.rejects(large.analyze({ size: 25000001 }), /25 MB/); assert.equal(large.calls.length, 0);
  const cancelled = uploadSetup({ signal: AbortSignal.abort() });
  await assert.rejects(cancelled.analyze(new Blob(['audio'], { type: 'audio/webm' }))); assert.equal(cancelled.calls.length, 0);
});

test('recording analysis includes bounded slide text, never the source presentation file',async()=>{
 const s=uploadSetup();await s.analyze(new Blob(['audio'],{type:'audio/webm'}),{title:'A'.repeat(180),text:'B'.repeat(25000),file:'must not send'});
 const input=s.calls[0][1];assert.equal(input.presentation.title.length,160);assert.equal(input.presentation.text.length,20000);assert.equal(input.presentation.file,undefined);
});
