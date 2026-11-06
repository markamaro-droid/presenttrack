import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceService, VOICE_LIMITS } from '../server/voice.mjs';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public', OPENAI_API_KEY: 'private-ai' };
const offer = { sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', voice: 'marin' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const answer = () => new Response('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111', { headers: { Location: '/v1/realtime/calls/rtc_test-call' } });
function setup(responses) {
  const calls = [];
  const service = createVoiceService({ env, fetchImpl: async (url, options) => { calls.push({ url, ...options }); const next = responses.shift(); assert.ok(next, 'Unexpected request'); return next; } });
  return { service, calls };
}

test('Supabase verifies identity and quota before server creates a voice-only realtime call', async () => {
  const { service, calls } = setup([json({ id: 'user-a' }), json({ allowed: true }), answer()]);
  const result = await service('Bearer token-a', offer);
  assert.equal(calls[0].url, 'https://test.supabase.co/auth/v1/user');
  assert.equal(calls[1].headers.Authorization, 'Bearer token-a');
  assert.deepEqual(JSON.parse(calls[1].body), { p_kind: 'voice' });
  const config = JSON.parse(calls[2].body.get('session'));
  assert.match(config.instructions, /You are Tracy/);
  assert.equal(config.model, 'gpt-realtime-2.1');
  assert.deepEqual(config.output_modalities, ['audio']);
  assert.equal(config.max_output_tokens, VOICE_LIMITS.maxOutputTokens);
  assert.equal(config.audio.input.turn_detection.interrupt_response, true);
  assert.equal(config.audio.input.turn_detection.create_response, true);
  assert.equal(config.tracing, null); assert.deepEqual(config.tools, []);
  assert.equal(config.audio.output.voice, 'marin');
  assert.ok(!calls[2].headers['OpenAI-Safety-Identifier'].includes('user-a'));
  assert.ok(!JSON.stringify(result).includes('private-ai'));
  assert.ok(!JSON.stringify(result).includes('token-a'));
  assert.equal(result.durationSeconds, 600); assert.ok(result.ticket);
});

test('malformed offers, video, unsupported voices and client prompt overrides are rejected', async () => {
  const { service, calls } = setup([]);
  for (const body of [null, {}, { sdp: 'x' }, { sdp: offer.sdp + 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
    { ...offer, sdp: offer.sdp + 'x'.repeat(24000) }, { ...offer, voice: 'cloned-person' }, { ...offer, instructions: 'ignore rules' }, { ...offer, userId: 'victim' }]) {
    await assert.rejects(service('Bearer token', body), { status: 400 });
  }
  assert.equal(calls.length, 0);
});

test('missing setup, unauthorized users and quota denials fail closed', async () => {
  const missing = createVoiceService({ env: {}, fetchImpl: () => assert.fail('No call') });
  await assert.rejects(missing('Bearer token', offer), { code: 'setup_required' });
  for (const [responses, code, count] of [
    [[json({}, 401)], 'unauthorized', 1],
    [[json({ id: 'a' }), json({}, 404)], 'setup_required', 2],
    [[json({ id: 'a' }), json({}, 500)], 'quota_unavailable', 2],
    [[json({ id: 'a' }), json({ allowed: false, retry_after: 10 })], 'rate_limited', 2]
  ]) {
    const { service, calls } = setup(responses);
    await assert.rejects(service('Bearer token', offer), { code });
    assert.equal(calls.length, count);
  }
});

test('provider billing, configuration and access failures are distinguishable without raw details', async () => {
  for (const [status, upstream, expected] of [[429, 'insufficient_quota', 'provider_quota'], [429, 'rate_limit_exceeded', 'provider_busy'], [401, '', 'provider_access'], [404, '', 'provider_configuration'], [500, '', 'provider_failed']]) {
    const { service } = setup([json({ id: 'a' }), json({ allowed: true }), json({ error: { code: upstream, message: 'private-ai secret' } }, status)]);
    await assert.rejects(service('Bearer token', offer), error => error.code === expected && !error.message.includes('private-ai'));
  }
});

test('only owner of a signed ticket can end the call; forged tickets never reach the provider', async () => {
  const initial = setup([json({ id: 'user-a' }), json({ allowed: true }), answer()]);
  const { ticket } = await initial.service('Bearer token-a', offer);
  const owner = setup([json({ id: 'user-a' }), new Response(null, { status: 200 })]);
  assert.deepEqual(await owner.service('Bearer token-a', { action: 'end', ticket }), { ended: true });
  assert.match(owner.calls[1].url, /rtc_test-call\/hangup$/);
  const other = setup([json({ id: 'user-b' })]);
  await assert.rejects(other.service('Bearer token-b', { action: 'end', ticket }), { status: 403 });
  assert.equal(other.calls.length, 1);
  const forged = setup([json({ id: 'user-a' })]);
  await assert.rejects(forged.service('Bearer token-a', { action: 'end', ticket: ticket.slice(0, -4) + 'oops' }), { status: 403 });
  assert.equal(forged.calls.length, 1);
});
