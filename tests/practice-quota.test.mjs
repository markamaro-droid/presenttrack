import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccess } from '../server/ai-access.mjs';
import { createPracticeHandler } from '../api/practice.js';
const env = { SUPABASE_URL: 'https://test.supabase.co' };
test('practice uses a separate authenticated quota and passes wait time through HTTP', async () => {
  const calls = [];
  const access = createAccess({ env, fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); return new Response(JSON.stringify({ allowed: false, retry_after: 125 }));
  } });
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
  await createPracticeHandler(async () => access.quota({ headers: { Authorization: 'Bearer student' } }, 'practice'))({ method: 'POST', headers: { authorization: 'Bearer student', 'content-type': 'application/json' }, body: '{}' }, res);
  assert.match(calls[0].url, /take_practice_slot$/); assert.equal(calls[0].body, '{}');
  assert.equal(calls[0].headers.Authorization, 'Bearer student');
  assert.equal(res.statusCode, 429); assert.equal(res.headers['Retry-After'], '125');
  assert.equal(res.body.error, 'rate_limited'); assert.match(res.body.message, /3 minute/); assert.doesNotMatch(res.body.message, /conversation/);
});
test('unavailable practice quota fails closed without switching to conversation quota', async () => {
  for (const response of [new Response('{}', { status: 404 }), new Response('{}', { status: 500 }), new Response('{}')]) {
    let calls = 0;
    const access = createAccess({ env, fetchImpl: async () => { calls++; return response; } });
    await assert.rejects(access.quota({ headers: {} }, 'practice'), { status: 503 }); assert.equal(calls, 1);
  }
});
