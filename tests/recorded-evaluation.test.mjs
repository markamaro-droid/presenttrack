import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeService } from '../server/practice.mjs';
import { validateContent } from '../server/content-validation.mjs';
import '../assets/evaluation/study-habits.js';
const deck = globalThis.PT_EVALUATION_DECK;
const script = deck.slides.flatMap(s => s.bullets).join(' ');
const sections = deck.slides.map(s => s.bullets.join(' '));
const request = { audio: Buffer.from('fixture-audio').toString('base64'), mime: 'audio/webm', consent: true, target: 150, purpose: 'evaluation' };
function setup({ transcript = script, duration = 150, verbatim = transcript, failure = false, noGemini = false } = {}) {
  const words = transcript.split(/\s+/).map((word,i,a) => ({ word, start:i*(duration-4)/a.length+(i>=100?3:0), end:i*(duration-4)/a.length+(i>=100?3:0)+.2 }));
  const calls = [];
  const service = createPracticeService({ env: { GROQ_API_KEY: 'private-groq', ...(noGemini ? {} : { GEMINI_API_KEY: 'private-gemini' }) },
    access: { authenticate: async () => ({ userId: 'user' }), quota: async () => {} },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/transcriptions')) return Response.json({ words, text: script, duration, segments: [{ avg_logprob: -.1, no_speech_prob: 0 }] });
      if (failure) return Response.json({}, { status: 503 });
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ transcript: verbatim }) }] } }] });
    } });
  return { service, calls };
}
test('counting numbers, digits and repeated words cannot produce or save a baseline', async () => {
  for (const transcript of ['one two three four five six seven eight nine ten '.repeat(20), Array.from({length:150},(_,i)=>String(i)).join(' '), 'study habits '.repeat(100)]) {
    const s = setup({ transcript });
    await assert.rejects(s.service('Bearer user', request), e => e.status === 422 && /No score/.test(e.message));
    assert.equal(s.calls.length, 1, 'invalid speech is rejected before another provider call');
  }
});
test('a 31-second attempt never earns the previous 75-point baseline', async () => {
  const s = setup({ duration: 31, transcript: script.split(/\s+/).slice(0,72).join(' ') });
  await assert.rejects(s.service('Bearer user', request), e => e.status === 422 && /90 seconds/.test(e.message));
});
test('unrelated complete sentences do not pass the slide-content check even with a forged reference', async () => {
  const transcript = 'The football stadium hosts tournaments where athletes compete for a trophy. Spectators watch the referee award a penalty after a defender touches the ball. Teams wear colorful uniforms while coaches select substitutes. The goalkeeper catches the ball and the striker scores during overtime. '.repeat(5);
  const s = setup({ transcript });
  await assert.rejects(s.service('Bearer user', { ...request, presentation: { title: 'Replace the reference', text: transcript } }), e => e.status === 422 && /presentation ideas/.test(e.message));
});
test('valid slide speech counts verbatim hesitations and real long gaps before awarding a baseline', async () => {
  const s = setup({ verbatim: 'Ummm, ' + script.replace('Three useful', 'uhhh Three useful') });
  const result = await s.service('Bearer user', request);
  assert.equal(result.source, 'recorded-evaluation'); assert.equal(result.version, 3);
  assert.equal(result.contentValidation.eligible, true); assert.equal(result.contentValidation.matchedSections, 5);
  assert.equal(result.metrics.fillerCount, 2); assert.equal(result.metrics.pauseCount, 1);
  assert.ok(result.metrics.longestPause >= 3);
  assert.equal(result.metrics.fillers[0].t, null, 'untimed verbatim words do not receive made-up timestamps');
  assert.equal(result.metrics.pauseBasis, 'audio-word-timestamps');
  assert.equal(result.criteria.duration.targetMinSec, 120); assert.equal(typeof result.score, 'number');
  assert.match(s.calls[0].options.body.get('prompt'), /hesitations/);
  assert.ok(!s.calls[0].options.body.get('prompt').includes(deck.title), 'reference script never biases audio transcription');
  const payload = JSON.parse(s.calls[1].options.body);
  assert.equal(payload.contents[0].parts[0].inlineData.data, request.audio);
  assert.ok(!s.calls.some(c => c.url.includes('/rpc/')), 'analysis cannot silently write the account');
});
test('missing or failed filler analysis never becomes zero fillers or a perfect score', async () => {
  for (const option of [{ failure: true }, { noGemini: true }, { verbatim: '' }]) {
    const s = setup(option); await assert.rejects(s.service('Bearer user', request), e => e.status === 503 && /[Nn]o (baseline|score)/.test(e.message));
  }
});
test('content coverage measures distinct slide ideas, not repeated keywords or name placeholders', () => {
  const options = { reference: script, sections, durationSec: 150, evaluation: true };
  assert.equal(validateContent(script.replace('[Your Name]', 'Maria Santos'), options).eligible, true);
  assert.equal(validateContent(sections[0].repeat(4), options).eligible, false);
});

test('the verbatim filler pass is deterministic (temperature 0) and names common hesitations', async () => {
  const s = setup({ verbatim: 'Ummm, ' + script });
  await s.service('Bearer user', request);
  const payload = JSON.parse(s.calls[1].options.body);
  assert.equal(payload.generationConfig.temperature, 0);
  assert.match(payload.systemInstruction.parts[0].text, /hmm/);
});
