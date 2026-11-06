import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachService } from '../server/coach.mjs';
const env = { GROQ_API_KEY: 'groq-private', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public' };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
function setup(responses, config = env) {
  const calls = [];
  const service = createCoachService({ env: config, fetchImpl: async (url, init) => { calls.push({ url, ...init }); assert.ok(responses.length, 'Unexpected request'); const next = responses.shift(); if (next instanceof Error) throw next; return next; } });
  return { service, calls };
}
test('Groq starts require authentication and the voice quota without needing an OpenAI key', async () => {
  const s = setup([json({ id: 'a' }), json({ allowed: true })]);
  assert.deepEqual(await s.service('Bearer real-user-token', { action: 'start' }), { ready: true });
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].headers.Authorization, 'Bearer real-user-token');
  assert.deepEqual(JSON.parse(s.calls[1].body), { p_kind: 'voice' });
});

test('Groq failures fall back once to Gemini with translated history and one database quota charge', async () => {
  for (const failure of [json({}, 429), json({}, 503), json({}, 401), json({}, 403), json({}, 404), new Error('private network details')]) {
    const s = setup([json({ id: 'a' }), json({ allowed: true }), failure, json({ candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }, { text: 'Pause between ideas.' }] } }] })], { ...env, GEMINI_API_KEY: 'gemini-private' });
    assert.deepEqual(await s.service('Bearer user-token', { message: 'Help', history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }] }), { reply: 'Pause between ideas.' });
    assert.equal(s.calls.length, 4);
    assert.equal(s.calls.filter(c => c.url.includes('take_tracy_slot')).length, 1);
    const call = s.calls[3]; assert.match(call.url, /gemini-3.5-flash-lite:generateContent$/);
    assert.equal(call.headers['x-goog-api-key'], 'gemini-private');
    assert.ok(!call.url.includes('gemini-private')); assert.ok(!call.body.includes('user-token'));
    const body = JSON.parse(call.body); assert.deepEqual(body.contents.map(c => c.role), ['user', 'model', 'user']);
    assert.equal(body.contents.at(-1).parts[0].text, 'Help'); assert.equal(body.generationConfig.maxOutputTokens, 600);
    assert.match(body.systemInstruction.parts[0].text, /Tracy/);
  }
});

test('Gemini works alone; successful Groq replies never call the backup', async () => {
  const only = setup([json({ id: 'a' }), json({ allowed: true }), json({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] })], { ...env, GROQ_API_KEY: '', GEMINI_API_KEY: 'gemini-private', GEMINI_MODEL: 'custom-model' });
  assert.deepEqual(await only.service('Bearer user-token', { message: 'Hi' }), { reply: 'Hello' });
  assert.match(only.calls[2].url, /custom-model:generateContent$/);
  const primary = setup([json({ id: 'a' }), json({ allowed: true }), json({ choices: [{ message: { content: 'Hello' } }] })], { ...env, GEMINI_API_KEY: 'gemini-private' });
  await primary.service('Bearer user-token', { message: 'Hi' }); assert.equal(primary.calls.length, 3);
});

test('fallback preserves auth and quota failures, stops at both provider limits, and respects blocked answers', async () => {
  const config = { ...env, GEMINI_API_KEY: 'gemini-private' };
  for (const responses of [[json({}, 401)], [json({ id: 'a' }), json({ allowed: false })]]) {
    const s = setup(responses, config);
    await assert.rejects(s.service('Bearer user-token', { message: 'Hi' }));
    assert.ok(s.calls.every(c => c.url.startsWith(env.SUPABASE_URL)));
  }
  const limited = setup([json({ id: 'a' }), json({ allowed: true }), json({}, 429), json({ error: { message: 'gemini-private' } }, 429, { 'retry-after': '77' })], config);
  await assert.rejects(limited.service('Bearer user-token', { message: 'Hi' }), e => e.code === 'provider_limit' && e.retryAfter === 77 && !e.message.includes('private'));
  assert.equal(limited.calls.length, 4);
  const bad = setup([json({ id: 'a' }), json({ allowed: true }), json({}, 400)], config);
  await assert.rejects(bad.service('Bearer user-token', { message: 'Hi' }), { code: 'provider_configuration' }); assert.equal(bad.calls.length, 3);
  const blocked = setup([json({ id: 'a' }), json({ allowed: true }), json({}, 429), json({ promptFeedback: { blockReason: 'SAFETY' } })], config);
  await assert.rejects(blocked.service('Bearer user-token', { message: 'Hi' }), { code: 'provider_blocked' }); assert.equal(blocked.calls.length, 4);
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
