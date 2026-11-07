import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechService } from '../server/speech.mjs';
import { createSpeechCache } from '../server/speech-cache.mjs';
const env = { SUPABASE_URL: 'https://example.test', CARTESIA_API_KEY: 'secret', CARTESIA_VOICE_ID: 'voice-a' };
const body = { text: 'Welcome to PresentTrack.', language: 'en' };
test('durable clips survive service restarts; changes and users do not collide', async () => {
  const files = new Map(); let generations = 0, quota = 0;
  const storage = { read: async (id, hash) => files.get(id.userId + hash), write: async (id, hash, audio) => { files.set(id.userId + hash, audio); return true; } };
  const make = (config = env) => createSpeechService({ env: config, storage,
    access: { authenticate: async userId => ({ userId, headers: {} }) },
    fetchImpl: async url => { if (url.includes('/rpc/')) { quota++; return new Response('{"allowed":true}'); }
      generations++; return new Response('RIFFtest'); }
  });
  const first = await make()('alice', body);
  assert.deepEqual(await make()('alice', body), first);
  assert.equal(generations, 1); assert.equal(quota, 1);
  await make()('bob', body);
  await make()('alice', { ...body, language: 'tl' });
  await make({ ...env, CARTESIA_VOICE_ID: 'voice-b' })('alice', body);
  await make({ ...env, CARTESIA_MODEL: 'different-model' })('alice', body);
  assert.equal(generations, 5);
});
test('same-instance concurrent cache misses generate once', async () => {
  let calls = 0;
  const service = createSpeechService({ env, access: { authenticate: async () => ({ userId: 'alice', headers: {} }) },
    storage: { read: async () => null, write: async () => true },
    fetchImpl: async url => { calls++; return new Response(url.includes('/rpc/') ? '{"allowed":true}' : 'RIFFtest'); }
  });
  const results = await Promise.all([service('token', body), service('token', body)]);
  assert.deepEqual(results[0], results[1]); assert.equal(calls, 2);
});
test('storage errors block spending and failed saves still deliver paid audio', async () => {
  let calls = 0;
  const options = { env, access: { authenticate: async () => ({ userId: 'alice', headers: {} }) },
    fetchImpl: async url => { calls++; return new Response(url.includes('/rpc/') ? '{"allowed":true}' : 'RIFFtest'); } };
  await assert.rejects(createSpeechService({ ...options, storage: { read: async () => { throw new Error('Storage down'); } } })('token', body));
  assert.equal(calls, 0);
  const service = createSpeechService({ ...options, storage: { read: async () => null, write: async () => { throw new Error('Storage down'); } } });
  assert.equal((await service('token', body)).cachedPermanently, false);
  await service('token', body); assert.equal(calls, 2);
});
test('Storage REST uses caller authorization and only genuine object misses allow generation', async () => {
  const identity = { userId: 'alice', headers: { Authorization: 'Bearer user-token', apikey: 'anon-key' } };
  let response = new Response('{"code":"NoSuchKey"}', { status: 404 });
  const storage = createSpeechCache({ env, fetchImpl: async (url, options) => {
    assert.match(url, /tracy-speech-cache\/alice\/hash.wav$/);
    assert.equal(options.headers.Authorization, identity.headers.Authorization);
    return response;
  } });
  assert.equal(await storage.read(identity, 'hash'), null);
  for (const code of ['NoSuchBucket', 'AccessDenied']) {
    response = new Response(JSON.stringify({ code }), { status: 400 });
    await assert.rejects(storage.read(identity, 'hash'), { code: 'speech_cache_unavailable' });
  }
  response = new Response('not audio');
  await assert.rejects(storage.read(identity, 'hash'), { code: 'speech_cache_invalid' });
  response = new Response('RIFFtest'); assert.equal((await storage.read(identity, 'hash')).toString(), 'RIFFtest');
  response = new Response('{}', { status: 409 }); assert.equal(await storage.write(identity, 'hash', Buffer.from('RIFFtest')), true);
});
