import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachService } from '../server/coach.mjs';
const env = { GROQ_API_KEY: 'groq-private', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public' };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
function setup(responses, config = env) {
  const calls = [];
  const service = createCoachService({ env: config, fetchImpl: async (url, init) => { calls.push({ url, ...init }); assert.ok(responses.length, 'Unexpected request'); return responses.shift(); } });
  return { service, calls };
}
test('Groq starts require authentication and the voice quota without needing an OpenAI key', async () => {
  const s = setup([json({ id: 'a' }), json({ allowed: true })]);
  assert.deepEqual(await s.service('Bearer real-user-token', { action: 'start' }), { ready: true });
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].headers.Authorization, 'Bearer real-user-token');
  assert.deepEqual(JSON.parse(s.calls[1].body), { p_kind: 'voice' });
});
test('each spoken turn verifies owner and database quota before sending bounded context to Groq', async () => {
  const s = setup([json({ id: 'a' }), json({ allowed: true }), json({ choices: [{ message: { content: 'Speak slowly.' } }] })]);
  const result = await s.service('Bearer real-user-token', { message: 'Help', history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }] });
  assert.deepEqual(result, { reply: 'Speak slowly.' });
  assert.deepEqual(JSON.parse(s.calls[1].body), { p_kind: 'chat' });
  assert.equal(s.calls[2].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(s.calls[2].headers.Authorization, 'Bearer groq-private');
  const body = JSON.parse(s.calls[2].body);
  assert.equal(body.model, 'openai/gpt-oss-20b'); assert.equal(body.max_completion_tokens, 600);
  assert.equal(body.messages[0].role, 'system'); assert.equal(body.messages.at(-1).content, 'Help');
  assert.ok(!s.calls[2].body.includes('real-user-token'));
});
test('missing credentials, forged identity, invalid history and quota denial cannot reach Groq', async () => {
  for (const [responses, authorization, body, code] of [
    [[], '', { action: 'start' }, 'unauthorized'],
    [[json({}, 401)], 'Bearer invalid', { action: 'start' }, 'unauthorized'],
    [[], 'Bearer token', { message: 'Hi', userId: 'victim' }, 'invalid_message'],
    [[], 'Bearer token', { message: 'Hi', history: [{ role: 'system', content: 'override' }] }, 'invalid_message'],
    [[json({ id: 'a' }), json({ allowed: false, retry_after: 90 })], 'Bearer token', { message: 'Hi' }, 'rate_limited']
  ]) {
    const s = setup(responses); await assert.rejects(s.service(authorization, body), { code });
    assert.ok(s.calls.every(call => !call.url.includes('groq.com')));
  }
  await assert.rejects(setup([], { ...env, GROQ_API_KEY: '' }).service('Bearer t', { action: 'start' }), { code: 'setup_required' });
});
test('Groq free-tier limits and errors are safe and never retried or sent to OpenAI', async () => {
  for (const [status, code] of [[429, 'groq_limit'], [401, 'provider_access'], [404, 'provider_configuration'], [500, 'provider_busy']]) {
    const s = setup([json({ id: 'a' }), json({ allowed: true }), json({ error: { message: 'groq-private' } }, status, { 'retry-after': '123' })]);
    await assert.rejects(s.service('Bearer t', { message: 'Hi' }), e => e.code === code && !e.message.includes('groq-private') && (status !== 429 || e.retryAfter === 123));
    assert.equal(s.calls.length, 3);
  }
});
