import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechService } from '../server/speech.mjs';
const env = { CARTESIA_API_KEY: 'test-secret', CARTESIA_VOICE_ID: 'fixed-voice', SUPABASE_URL: 'https://example.test' };
const request = { text: 'Hello from Tracy.', language: 'en' };
function fixture({ allowed = true, authenticated = true, providerStatus = 200 } = {}) {
  const calls = [];
  const service = createSpeechService({ env, storage: { read: async () => null, write: async () => true }, access: { authenticate: async token => {
    if (!authenticated) throw new Error('unauthorized');
    return { userId: token, headers: {} };
  } }, fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return url.includes('/rpc/') ? new Response(JSON.stringify({ allowed })) : new Response('RIFFtest', { status: providerStatus });
  } });
  return { service, calls };
}
test('Cartesia uses fixed server voice and caches per user', async () => {
  const { service, calls } = fixture();
  const first = await service('alice', request);
  assert.equal(first.provider, 'cartesia');
  assert.deepEqual(await service('alice', request), first);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.voice, 'fixed-voice');
  await service('bob', request);
  assert.equal(calls.length, 4);
});
test('invalid, unauthenticated and quota-blocked requests never synthesize', async () => {
  const f = fixture();
  await assert.rejects(f.service('alice', { ...request, text: 'x'.repeat(1001) }));
  assert.equal(f.calls.length, 0);
  const unauth = fixture({ authenticated: false });
  await assert.rejects(unauth.service('', request)); assert.equal(unauth.calls.length, 0);
  const limited = fixture({ allowed: false });
  await assert.rejects(limited.service('alice', request), { code: 'speech_limit' });
  assert.equal(limited.calls.length, 1);
});
test('provider failure is safe and is not cached', async () => {
  const f = fixture({ providerStatus: 429 });
  for (let i = 0; i < 2; i++) await assert.rejects(f.service('alice', request), { code: 'speech_unavailable' });
  assert.equal(f.calls.length, 4);
});
