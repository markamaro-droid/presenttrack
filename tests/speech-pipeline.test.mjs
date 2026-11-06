import test from 'node:test';
import assert from 'node:assert/strict';
import { speechMetrics, wordErrorRate } from '../server/tasks/speech-metrics.mjs';
import { trimEdges, wav, audioChunks, readPcmWav } from '../server/tasks/audio.mjs';
import { evaluateSpeech, analyzeSpeech } from '../server/tasks/speech.mjs';
test('pauses are strictly over threshold, overlaps do not create phantom pauses', () => {
  const words = [{ start: 0, end: 5 }, { start: 1, end: 2 }, { start: 5, end: 6 }, { start: 8, end: 9 }, { start: 11.1, end: 12 }];
  const m = speechMetrics({ transcript: 'one two three four five', words, verbatim: 'um one uh two parang ano three four five', durationSec: 15 });
  assert.equal(m.compact.pauseCount, 1); assert.equal(m.compact.wpm, 20);
  assert.equal(m.compact.fillerCount, 2); assert.equal(m.compact.possibleFillerCount, 2);
  assert.equal(m.pauses[0].start, 9); assert.ok(Number.isFinite(m.score.value));
});

test('analysis sends compact metrics, never timestamp arrays, and suppresses invented filler findings', async () => {
  const inputs = [];
  const metrics = speechMetrics({ transcript: 'Hello', durationSec: 1 });
  const result = await analyzeSpeech({ transcript: 'Hello', metrics, words: [{ word: 'Hello', start: 0, end: 1 }] }, {
    userId: 'a', consent: true, route: async req => { inputs.push(req); return { provider: 'deepseek', model: 'deepseek-flash', data: { redundancies: [], unclearSentences: [], fillerPatterns: ['invented'], adjustments: [] } }; }
  });
  assert.equal(inputs.length, 1); const sent = JSON.parse(inputs[0].input.text);
  assert.equal(sent.words, undefined); assert.equal(sent.metrics.pauses, undefined);
  assert.deepEqual(result.data.fillerPatterns, []);
});
test('missing verbatim/timing stays unavailable; repetitions and score are deterministic', () => {
  const input = { transcript: 'I I think', durationSec: 10 };
  const m = speechMetrics(input); assert.equal(m.compact.fillerCount, null); assert.equal(m.compact.pauseCount, null);
  assert.equal(m.score.value, null); assert.equal(m.compact.repetitionCount, 1);
  assert.deepEqual(speechMetrics(input), m);
  assert.throws(() => speechMetrics(input, { weights: { pace: -1, pauses: 1, fillers: 1 } }));
  assert.equal(wordErrorRate('hello world', 'hello world'), 0); assert.equal(wordErrorRate('hello world', 'hello'), 0.5);
});
test('edge trim preserves long internal silence and records offsets; chunk offsets are stable', () => {
  const pcm = Buffer.alloc(16000 * 2 * 15);
  for (const [start, end] of [[2, 3], [8, 9], [13, 14]]) for (let i = start * 16000; i < end * 16000; i++) pcm.writeInt16LE(4000, i * 2);
  const prepared = trimEdges(wav(pcm)); assert.equal(prepared.trimOffsetSec, 1.75); assert.equal(prepared.durationSec, 12.5);
  const chunks = audioChunks(prepared.audio, 10); assert.equal(chunks.length, 2); assert.equal(chunks[1].offsetSec, 10);
  assert.equal(readPcmWav(chunks[0].audio).readInt16LE(4 * 32000), 0);
  assert.throws(() => trimEdges(wav(Buffer.alloc(32000))), /no_audible_signal/);
});
test('pipeline reuses Whisper timing and marks failed Gemini filler pass unavailable', async () => {
  const tasks = []; const prepared = { audio: wav(Buffer.alloc(32000)), durationSec: 1, trimOffsetSec: 0 };
  const route = async ({ task }) => { tasks.push(task); if (task === 'verbatim') throw new Error('unavailable'); return { provider: 'groq', model: 'whisper-large-v3', data: { text: 'hello', words: [{ word: 'hello', start: 0, end: 0.5 }] } }; };
  const result = await evaluateSpeech({ prepared, route, userId: 'a', consent: true, needFillers: true });
  assert.deepEqual(tasks, ['transcription', 'verbatim']); assert.equal(result.metrics.compact.fillersAvailable, false); assert.equal(result.metrics.score.value, null);
});
