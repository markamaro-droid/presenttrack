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
  return {capture:new window.PTPracticeAudio.Capture(),get stops(){return stops},grant:()=>grant(stream)};
}
test('practice capture pauses, resumes, retains retry audio and stops the microphone',async()=>{
  const s=setup();await s.capture.start();s.capture.pause();assert.equal(s.capture.recorder.state,'paused');await s.capture.start();assert.equal(s.capture.recorder.state,'recording');
  const blob=await s.capture.finish();assert.equal(blob.size,5);assert.equal(await s.capture.finish(),blob);assert.equal(s.stops,1);s.capture.dispose();assert.equal(s.capture.blob,null);
});
test('navigation before microphone permission resolves releases the late stream',async()=>{
  const s=setup(true);const pending=s.capture.start();s.capture.dispose();s.grant();await assert.rejects(pending,/cancelled/);assert.equal(s.stops,1);
});
