import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeService } from '../server/practice.mjs';
const request = { audio: Buffer.from('test-audio').toString('base64'), mime:'audio/webm', target:120, consent:true };
const sample = { duration:120, text:'A test presentation.', words:Array.from({length:240},(_,i)=>({word:i===20?'um':'example',start:i*.5,end:i*.5+.4})), segments:[{avg_logprob:-.1,no_speech_prob:0}] };
function setup({deny=false,response=sample}={}) {
  const calls=[];
  const service=createPracticeService({env:{GROQ_API_KEY:'server-only'},access:{authenticate:async token=>{calls.push('auth');if(token!=='Bearer test')throw new Error('unauthorized');return{userId:'a'}},quota:async()=>{calls.push('quota');if(deny)throw new Error('limited')}},fetchImpl:async()=>{calls.push('provider');return new Response(JSON.stringify(response))}});
  return {service,calls};
}
test('practice derives pace, fillers, score and target duration from actual provider data',async()=>{
  const {service,calls}=setup();const result=await service('Bearer test',request);
  assert.deepEqual(calls,['auth','quota','provider']);assert.equal(result.metrics.wpm,120);assert.equal(result.metrics.fillerCount,1);assert.equal(result.metrics.words,240);
  assert.equal(result.durationAssessment.targetMinSec,108);assert.equal(result.source,'recorded-audio');assert.ok(result.feedback.recommendations.length);
});
test('authentication, consent, quota, size and invalid MIME block provider calls',async()=>{
  for(const [token,input,options] of [['bad',request,{}],['Bearer test',{...request,consent:false},{}],['Bearer test',request,{deny:true}],['Bearer test',{...request,mime:'text/html'},{}],['Bearer test',{...request,audio:'A'.repeat(4000001)},{}]]){
    const s=setup(options);await assert.rejects(s.service(token,input));assert.ok(!s.calls.includes('provider'));
  }
});
test('silence and missing timestamps never produce a fabricated report',async()=>{
  for(const response of [{duration:120,words:[]},{...sample,words:[{word:'x',start:5,end:4}]},{...sample,duration:601}]){
    const s=setup({response});await assert.rejects(s.service('Bearer test',request));
  }
});

function storedSetup({ failure = false, oversize = false } = {}) {
  const calls = [], userId = '12345678-1234-1234-1234-123456789abc';
  const service = createPracticeService({ env: { SUPABASE_URL: 'https://storage.test', GROQ_API_KEY: 'test' },
    access: { authenticate: async () => ({ userId, headers: { Authorization: 'Bearer user' } }), quota: async () => {} },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'DELETE') return new Response('{}');
      if (url.startsWith('https://storage.test')) return new Response('audio', { headers: { 'content-length': oversize ? '25000001' : '5' } });
      return failure ? new Response('{}', { status: 503 }) : new Response(JSON.stringify(sample));
    }
  });
  return { service, calls, input: { mime: 'audio/wav', target: 120, consent: true, storagePath: `${userId}/12345678-abcd-abcd-abcd-123456789abc` } };
}
test('large recordings are fetched privately and deleted after transcription', async () => {
  const s = storedSetup();
  assert.equal((await s.service('Bearer user', s.input)).metrics.wpm, 120);
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[0].options.headers.Authorization, 'Bearer user');
  assert.equal(s.calls[2].options.method, 'DELETE');
  assert.deepEqual(JSON.parse(s.calls[2].options.body).prefixes, [s.input.storagePath]);
});
test('foreign paths, traversal and ambiguous sources never reach storage or Groq', async () => {
  for (const edit of [{ storagePath: 'another-user/file' }, { storagePath: 'https://evil.test/file' }, { audio: request.audio }]) {
    const s = storedSetup(); await assert.rejects(s.service('Bearer user', { ...s.input, ...edit })); assert.equal(s.calls.length, 0);
  }
});
test('provider failures and oversized downloads still delete temporary audio', async () => {
  for (const options of [{ failure: true }, { oversize: true }]) {
    const s = storedSetup(options); await assert.rejects(s.service('Bearer user', s.input));
    assert.equal(s.calls.at(-1).options.method, 'DELETE');
    if (options.oversize) assert.equal(s.calls.length, 2);
  }
});
