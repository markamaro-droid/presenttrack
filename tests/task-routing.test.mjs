import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskRouter, ROUTES } from '../server/tasks/router.mjs';
const env = { OPENAI_API_KEY: 'secret-openai', GROQ_API_KEY: 'secret-groq', GEMINI_API_KEY: 'secret-gemini', DEEPSEEK_API_KEY: 'secret-deepseek' };
const analysis = { redundancies: [], unclearSentences: [], fillerPatterns: [], adjustments: [] };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const gemini = text => json({ candidates: [{ content: { parts: [{ text }] } }] });
const chat = text => json({ choices: [{ message: { content: text } }] });
function fixture(responses, options = {}) {
  const calls = [], logs = [];
  const route = createTaskRouter({ env, admit: async () => ({ id: 1 }), telemetry: e => logs.push(e), ...options,
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); if (!responses.length) throw new Error('unexpected_call'); const response = responses.shift(); if (response instanceof Error) throw response; return response; } });
  return { route, calls, logs };
}
const request = (task = 'analysis', input = { text: 'Compact transcript and metrics' }) => ({ task, input, userId: 'user-a', consent: true });
test('task routing orders match the requested policy', () => {
  assert.deepEqual(ROUTES.analysis, ['deepseek', 'gemini', 'groq']);
  assert.deepEqual(ROUTES.proofreading, ROUTES.analysis);
  assert.deepEqual(ROUTES.quickTips, ['groq', 'gemini']);
  assert.deepEqual(ROUTES.layout, ['gemini', 'openai']);
  assert.deepEqual(ROUTES.transcription, ['openai', 'groq']);
  assert.deepEqual(ROUTES.verbatim, ['gemini']);
});
test('429, 5xx, network, invalid JSON and schema failures fall through without leaking bodies', async () => {
  for (const failed of [json({}, 402), json({}, 429), json({}, 503), new Error('secret text'), new Response('bad json'), chat('{"bad":"shape"}')]) {
    const s = fixture([failed, gemini(JSON.stringify(analysis))]);
    const result = await s.route(request());
    assert.equal(result.provider, 'gemini'); assert.deepEqual(result.data, analysis);
    assert.match(s.calls[0].url, /deepseek/); assert.match(s.calls[1].url, /googleapis/);
    assert.ok(!JSON.stringify(s.logs).includes('secret')); assert.ok(!JSON.stringify(s.logs).includes('Compact transcript'));
    assert.ok(s.calls.every(c => c.signal instanceof AbortSignal));
  }
});
test('missing keys skipped, budget gate blocks paid calls, and no identity/consent costs no requests', async () => {
  const s = fixture([gemini(JSON.stringify(analysis))], { env: { GEMINI_API_KEY: 'secret' }, admit: undefined });
  assert.equal((await s.route(request())).provider, 'gemini'); assert.equal(s.calls.length, 1);
  const paid = fixture([], { env: { OPENAI_API_KEY: 'secret' }, admit: undefined });
  await assert.rejects(paid.route(request('transcription', { audio: new Uint8Array([1]), mime: 'audio/wav', audioSeconds: 1 })), { code: 'budget_blocked' });
  assert.equal(paid.calls.length, 0);
  const blocked = fixture([]); await assert.rejects(blocked.route({ ...request(), consent: false }));
  assert.equal(blocked.calls.length, 0);
});
test('DeepSeek never receives audio or images; OpenAI transcription does not request unsupported timestamps', async () => {
  const s = fixture([]);
  await assert.rejects(s.route(request('analysis', { text: 'Hi', audio: new Uint8Array([1]) })), { code: 'invalid_text' });
  await assert.rejects(s.route(request('analysis', { text: 'Hi', images: [{ data: 'YWJj', mime: 'image/png' }] })), { code: 'unexpected_images' });
  assert.equal(s.calls.length, 0);
  const tr = fixture([json({ text: 'Hello' })]);
  await tr.route(request('transcription', { audio: new Uint8Array([1]), mime: 'audio/wav', audioSeconds: 1 }));
  assert.equal(tr.calls[0].body.get('model'), 'gpt-4o-transcribe');
  assert.equal(tr.calls[0].body.get('timestamp_granularities[]'), null);
});
test('cache separates users, inputs and model versions; blocked responses never fall through', async () => {
  const values = new Map(); const cache = { get: async k => values.get(k), set: async (k, v) => values.set(k, v) };
  const s = fixture([chat('Tip A'), chat('Tip B')], { cache });
  assert.equal((await s.route(request('quickTips'))).cached, false);
  assert.equal((await s.route(request('quickTips'))).cached, true);
  assert.equal((await s.route({ ...request('quickTips'), userId: 'user-b' })).cached, false);
  assert.equal(s.calls.length, 2);
  const changed = fixture([chat('Tip C')], { cache, env: { ...env, GROQ_QUICKTIPS_MODEL: 'another-model' } });
  assert.equal((await changed.route(request('quickTips'))).cached, false);
  const blocked = fixture([json({ promptFeedback: { blockReason: 'SAFETY' } })]);
  await assert.rejects(blocked.route(request('layout', { text: 'slide 1', images: [{ mime: 'image/png', data: 'YWJj' }] })), { code: 'provider_blocked' });
  assert.equal(blocked.calls.length, 1);
});

test('cache write failure never repeats a successful billable request', async () => {
  const s = fixture([chat('A tip')], { cache: { get: async () => null, set: async () => { throw new Error('cache down'); } } });
  assert.equal((await s.route(request('quickTips'))).provider, 'groq'); assert.equal(s.calls.length, 1);
});

test('layout fallback goes only to OpenAI; Groq timing requests verbose word timestamps', async () => {
  const s = fixture([json({}, 503), chat('{"flags":[]}')]);
  assert.equal((await s.route(request('layout', { text: 'slide-1', images: [{ mime: 'image/png', data: 'YWJj' }] }))).provider, 'openai');
  assert.match(s.calls[1].url, /api.openai.com/);
  const t = fixture([json({ text: 'Hello', words: [{ word: 'Hello', start: 0, end: 0.5 }] })]);
  await t.route(request('timing', { audio: new Uint8Array([1]), mime: 'audio/wav', audioSeconds: 1 }));
  assert.equal(t.calls[0].body.get('response_format'), 'verbose_json');
  assert.equal(t.calls[0].body.get('timestamp_granularities[]'), 'word');
});
