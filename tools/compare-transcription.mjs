// Explicit opt-in benchmark. Never prints transcripts, paths, API keys or raw provider errors.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { prepareAudio, audioChunks } from '../server/tasks/audio.mjs';
import { createTaskRouter } from '../server/tasks/router.mjs';
import { wordErrorRate, speechMetrics } from '../server/tasks/speech-metrics.mjs';

const args = process.argv.slice(2), manifestPath = args.find(a => !a.startsWith('--'));
if (!manifestPath || !args.includes('--consent')) {
  console.error('Usage: node --env-file=.env.local tools/compare-transcription.mjs samples.json --consent [--allow-paid]');
  process.exit(1);
}
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 5 || manifest.some(s => typeof s.audio !== 'string' || typeof s.reference !== 'string' || !s.reference.trim() || s.reference.length > 24000)) throw new Error('invalid_manifest');
  // Convert and validate ALL recordings before any provider call.
  const samples = [];
  for (const sample of manifest) samples.push({ reference: sample.reference, prepared: await prepareAudio(resolve(dirname(resolve(manifestPath)), sample.audio)) });
  const totalSeconds = samples.reduce((sum, s) => sum + s.prepared.durationSec, 0);
  if (totalSeconds > 120) throw new Error('benchmark_exceeds_120_seconds');
  const allowPaid = args.includes('--allow-paid'); let attempts = 0;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    for (const provider of ['openai', 'groq', 'gemini']) {
      const key = `${provider.toUpperCase()}_API_KEY`;
      if (!process.env[key]?.trim() || (!allowPaid && (provider === 'openai' || process.env[`${provider.toUpperCase()}_PAID`] === 'true'))) {
        console.log(JSON.stringify({ sample: index + 1, provider, outcome: 'skipped_missing_key_or_paid_disabled' })); continue;
      }
      const env = { ...process.env, OPENAI_API_KEY: '', GROQ_API_KEY: '', GEMINI_API_KEY: '', DEEPSEEK_API_KEY: '', [key]: process.env[key] };
      const route = createTaskRouter({ env, admit: async () => allowPaid ? { benchmark: true } : false,
        telemetry: event => console.log(JSON.stringify({ sample: index + 1, ...event })) });
      const parts = [], words = []; let failed = false;
      for (const chunk of audioChunks(sample.prepared.audio)) {
        if (++attempts > 30) throw new Error('benchmark_call_cap');
        try {
          const result = await route({ task: provider === 'gemini' ? 'verbatim' : 'transcription', input: chunk, userId: 'local-benchmark', consent: true });
          parts.push(result.data.text ?? result.data.transcript);
          if (result.data.words) words.push(...result.data.words.map(w => ({ ...w, start: w.start + chunk.offsetSec, end: w.end + chunk.offsetSec })));
        } catch { failed = true; break; }
      }
      if (failed) { console.log(JSON.stringify({ sample: index + 1, provider, outcome: 'failed', wer: null })); continue; }
      const text = parts.join(' ');
      const metrics = speechMetrics({ transcript: text, verbatim: provider === 'gemini' ? text : null, words: words.length ? words : null, durationSec: sample.prepared.durationSec });
      const referenceMetrics = speechMetrics({ transcript: sample.reference, verbatim: sample.reference, durationSec: sample.prepared.durationSec });
      console.log(JSON.stringify({ sample: index + 1, provider, outcome: 'compared', wer: wordErrorRate(sample.reference, text),
        wordCount: metrics.compact.wordCount, timingAvailable: metrics.compact.timingAvailable,
        observedFillerCount: metrics.compact.fillerCount, referenceFillerCount: referenceMetrics.compact.fillerCount,
        possibleFillerCount: metrics.compact.possibleFillerCount, referencePossibleFillerCount: referenceMetrics.compact.possibleFillerCount,
        normalizedDurationSec: sample.prepared.durationSec, trimOffsetSec: sample.prepared.trimOffsetSec }));
    }
  }
} catch {
  console.error('Benchmark did not complete. Check manifest, recording limits, FFmpeg availability and provider configuration. No transcript or raw provider error was logged.');
  process.exitCode = 1;
}
