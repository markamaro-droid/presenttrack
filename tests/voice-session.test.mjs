import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/voice-session.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('default browser fetch retains its global receiver for start and hangup requests', async () => {
  const context = { navigator: {}, requests: [] };
  vm.createContext(context);
  vm.runInContext(`globalThis.fetch = function(url) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    requests.push(url);
    return Promise.resolve('ok');
  };`, context);
  vm.runInContext(source, context);
  const session = new context.TracyVoiceSession({ audio: {} });
  assert.equal(await session.fetch('/api/voice'), 'ok');
  assert.equal(await session.fetch('/api/voice', { method: 'POST' }), 'ok');
  assert.equal(context.requests.length, 2);
});

function setup(options = {}) {
  const timers = new Map(); let timerId = 0;
  const context = { AbortController, AbortSignal, fetch, navigator: { onLine: options.online ?? true }, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id) };
  vm.createContext(context); vm.runInContext(source, context);
  const track = { enabled: false, stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel = { readyState: 'connecting', sent: [], send(raw) { this.sent.push(JSON.parse(raw)); }, close() { this.readyState = 'closed'; this.onclose?.(); } };
  let peer;
  class Peer {
    constructor() { peer = this; this.connectionState = 'new'; }
    addTrack(track, stream) { this.track = track; this.stream = stream; }
    createDataChannel() { return channel; }
    async createOffer() { if (options.offerError) throw new Error('private browser detail'); return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription(answer) { if (options.answerError) throw new Error('private SDP detail'); this.answer = answer; }
    close() { this.closed = true; this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
  }
  const states = [], captions = [], calls = [];
  const audio = { srcObject: null, muted: false, plays: 0, pause() { this.paused = true; }, async play() { this.plays++; if (options.blockAudio) throw new Error('blocked'); } };
  let mediaCalls = 0;
  const session = new context.TracyVoiceSession({ audio, Peer,
    mediaDevices: { getUserMedia: () => { mediaCalls++; return options.media ? options.media() : Promise.resolve(stream); } },
    getSession: options.auth || (async () => ({ user: { id: 'user-a' }, access_token: 'token-a' })),
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init });
      if (JSON.parse(init.body).action === 'end') return new Response('{"ended":true}');
      return options.fetcher ? options.fetcher() : new Response(JSON.stringify({ sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111', ticket: 'opaque-ticket', durationSeconds: 600 }));
    },
    onState: state => states.push(state), onCaption: (who, text) => captions.push({ who, text })
  });
  const ready = () => { channel.readyState = 'open'; channel.onopen(); };
  const event = value => channel.onmessage({ data: JSON.stringify(value) });
  const expire = ms => { const item = [...timers.entries()].find(([, value]) => value.ms === ms); assert.ok(item, 'Expected timer ' + ms); timers.delete(item[0]); item[1].fn(); };
  return { session, track, stream, channel, audio, states, captions, calls, ready, event, expire, timers, get peer() { return peer; }, get mediaCalls() { return mediaCalls; } };
}

test('starts only after consent action, sends SDP not credentials, and supports multiple spoken turns', async () => {
  const ui = setup();
  assert.equal(ui.mediaCalls, 0);
  await ui.session.start('cedar');
  assert.equal(ui.mediaCalls, 1);
  assert.equal(ui.track.enabled, false); // No transmission while negotiating.
  assert.deepEqual(Object.keys(JSON.parse(ui.calls[0].body)).sort(), ['sdp', 'voice']);
  ui.ready();
  assert.equal(ui.track.enabled, true);
  for (let n = 0; n < 2; n++) {
    ui.event({ type: 'input_audio_buffer.speech_started', item_id: 'turn' + n });
    ui.event({ type: 'input_audio_buffer.speech_stopped' });
    assert.equal(ui.session.state, 'thinking');
    ui.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'turn' + n, transcript: 'Help me prepare' });
    ui.event({ type: 'response.created' }); ui.event({ type: 'output_audio_buffer.started' });
    assert.equal(ui.session.state, 'speaking');
    ui.event({ type: 'response.output_audio_transcript.delta', delta: 'Try a short opening.' });
    ui.event({ type: 'response.done', response: { status: 'completed' } });
    assert.equal(ui.session.state, 'speaking'); // Generation done does not mean audio finished.
    ui.event({ type: 'output_audio_buffer.stopped' });
    assert.equal(ui.session.state, 'listening');
  }
  assert.equal(ui.calls.length, 1); // Same provider conversation, no reconnect between turns.
  ui.session.stop();
  assert.equal(ui.track.stopped, true); assert.equal(ui.peer.closed, true);
  assert.equal(ui.audio.srcObject, null); assert.equal(ui.session.active, false);
  assert.equal(JSON.parse(ui.calls[1].body).action, 'end');
  assert.equal(ui.timers.size, 0);
});

test('duplicate Start during permission prompt makes only one capture request', async () => {
  const pending = deferred(); const ui = setup({ media: () => pending.promise });
  const first = ui.session.start(); await flush();
  await ui.session.start(); assert.equal(ui.mediaCalls, 1);
  pending.resolve(ui.stream); await first; ui.session.stop();
});

test('late microphone permission after End immediately stops every granted track', async () => {
  const pending = deferred(); const ui = setup({ media: () => pending.promise });
  const first = ui.session.start(); await flush(); ui.session.stop();
  pending.resolve(ui.stream); await first; await flush();
  assert.equal(ui.track.stopped, true); assert.equal(ui.calls.length, 0);
});

test('permission denial and missing microphone are specific recoverable errors', async () => {
  for (const [name, text] of [['NotAllowedError', /blocked/], ['NotFoundError', /No microphone/], ['NotReadableError', /busy/]]) {
    const ui = setup({ media: async () => { const e = new Error('private device name'); e.name = name; throw e; } });
    await ui.session.start();
    assert.equal(ui.session.state, 'error'); assert.match(ui.states.at(-1).message, text);
    assert.equal(ui.session.active, false); assert.equal(ui.calls.length, 0);
  }
});

test('unauthenticated sessions never open microphone', async () => {
  const ui = setup({ auth: async () => null }); await ui.session.start();
  assert.equal(ui.mediaCalls, 0); assert.match(ui.states.at(-1).message, /sign in/);
});

test('mute prevents transmission; interrupt clears provider playback and immediately silences audio', async () => {
  const ui = setup(); await ui.session.start(); ui.ready();
  ui.session.muteMicrophone(true); assert.equal(ui.track.enabled, false);
  assert.equal(ui.channel.sent.at(-1).type, 'input_audio_buffer.clear');
  ui.session.muteMicrophone(false); assert.equal(ui.track.enabled, true);
  ui.event({ type: 'response.created' }); ui.event({ type: 'output_audio_buffer.started' });
  ui.session.interrupt();
  assert.equal(ui.audio.muted, true);
  assert.deepEqual(ui.channel.sent.slice(-2).map(x => x.type), ['response.cancel', 'output_audio_buffer.clear']);
  ui.event({ type: 'response.created' }); assert.equal(ui.audio.muted, false);
  ui.session.stop();
});

test('speaking over Tracy triggers local silence while provider VAD handles interruption', async () => {
  const ui = setup(); await ui.session.start(); ui.ready();
  ui.event({ type: 'response.created' }); ui.event({ type: 'output_audio_buffer.started' });
  ui.event({ type: 'input_audio_buffer.speech_started' });
  assert.equal(ui.audio.muted, true); assert.equal(ui.session.state, 'listening');
  ui.session.stop();
});

test('failed setup, quota and malformed answers release microphone and allow Retry', async () => {
  for (const [status, body, message] of [[503, { error: 'setup_required' }, /not set up/], [429, {}, /limit/], [200, {}, /failed/]]) {
    const ui = setup({ fetcher: async () => new Response(JSON.stringify(body), { status }) });
    await ui.session.start();
    assert.equal(ui.session.active, false); assert.equal(ui.track.stopped, true); assert.match(ui.states.at(-1).message, message);
  }
});

test('late SDP reply after End cannot reopen audio', async () => {
  const pending = deferred(); const ui = setup({ fetcher: () => pending.promise });
  const start = ui.session.start(); await flush(); ui.session.stop();
  pending.resolve(new Response(JSON.stringify({ sdp: 'v=0' }))); await start;
  assert.equal(ui.session.active, false); assert.equal(ui.peer.answer, undefined); assert.equal(ui.track.stopped, true);
});

test('autoplay rejection pauses microphone until a deliberate Enable audio gesture', async () => {
  const ui = setup({ blockAudio: true }); await ui.session.start(); ui.ready();
  ui.peer.ontrack({ streams: [ui.stream] }); await flush();
  assert.equal(ui.session.state, 'playback'); assert.equal(ui.track.enabled, false);
  ui.audio.play = async () => {};
  await ui.session.enablePlayback();
  assert.equal(ui.session.state, 'listening'); assert.equal(ui.track.enabled, true);
  ui.session.stop();
});

test('disconnect, turn timeout, inactivity and session duration release all resources', async () => {
  for (const scenario of ['disconnect', 'turn', 'idle', 'duration']) {
    const ui = setup(); await ui.session.start(); ui.ready();
    if (scenario === 'disconnect') { ui.peer.connectionState = 'disconnected'; ui.peer.onconnectionstatechange(); assert.equal(ui.track.enabled, false); ui.expire(8000); }
    if (scenario === 'turn') { ui.event({ type: 'input_audio_buffer.speech_stopped' }); ui.expire(45000); }
    if (scenario === 'idle') ui.expire(90000);
    if (scenario === 'duration') ui.expire(600000);
    assert.equal(ui.session.active, false); assert.equal(ui.track.stopped, true); assert.equal(ui.peer.closed, true); assert.equal(ui.timers.size, 0);
  }
});

test('provider failure never displays raw server details or leaves the microphone on', async () => {
  const ui = setup(); await ui.session.start(); ui.ready();
  ui.event({ type: 'error', error: { code: 'unknown', message: 'private secret diagnostics' } });
  assert.equal(ui.track.stopped, true); assert.ok(!ui.states.at(-1).message.includes('private'));
});

test('credit exhaustion during setup or a live call explains the billing issue and releases the microphone', async () => {
  const start = setup({ fetcher: async () => new Response(JSON.stringify({ error: 'provider_credits' }), { status: 503 }) });
  await start.session.start();
  assert.match(start.states.at(-1).message, /out of AI credits/);
  assert.equal(start.track.stopped, true);
  assert.equal(start.calls.length, 1);
  const live = setup(); await live.session.start(); live.ready();
  live.event({ type: 'error', error: { code: 'credit_balance_exhausted', message: 'private billing detail' } });
  assert.match(live.states.at(-1).message, /out of AI credits/);
  assert.equal(live.track.stopped, true);
  assert.equal(live.session.active, false);
});

test('captions tolerate malformed events and old transcription results', async () => {
  const ui = setup(); await ui.session.start(); ui.ready();
  ui.channel.onmessage({ data: 'bad json' });
  ui.event({ type: 'input_audio_buffer.speech_started', item_id: 'new' });
  ui.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'old', transcript: 'old secret' });
  assert.ok(!ui.captions.some(x => x.text === 'old secret'));
  ui.session.stop();
});

test('actual offline state is reported before starting capture or sending requests', async () => {
  const ui = setup({ online: false });
  await ui.session.start();
  assert.match(ui.states.at(-1).message, /browser is offline/);
  assert.equal(ui.mediaCalls, 0); assert.equal(ui.calls.length, 0);
});

test('auth, endpoint and SDP failures are distinguished instead of claiming the internet is down', async () => {
  for (const [options, expected] of [
    [{ auth: async () => { throw new Error('private auth details'); } }, /verify your sign-in/],
    [{ offerError: true }, /browser could not start live audio/],
    [{ fetcher: async () => { throw new TypeError('Failed to fetch'); } }, /website’s voice endpoint/],
    [{ answerError: true }, /live audio connection could not be established/]
  ]) {
    const ui = setup(options); await ui.session.start();
    assert.equal(ui.session.active, false); assert.match(ui.states.at(-1).message, expected);
    assert.ok(!ui.states.at(-1).message.includes('private'));
    if (ui.mediaCalls) assert.equal(ui.track.stopped, true);
  }
});
