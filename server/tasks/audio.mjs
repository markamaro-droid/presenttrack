import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function readPcmWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('invalid_wav');
  let format, pcm;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) throw new Error('truncated_wav');
    const kind = buffer.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ' && size >= 16) format = { codec: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), rate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) };
    if (kind === 'data') pcm = buffer.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!format || format.codec !== 1 || format.channels !== 1 || format.rate !== 16000 || format.bits !== 16 || !pcm?.length || pcm.length % 2) throw new Error('expected_16khz_mono_pcm16');
  return pcm;
}
export function wav(pcm) {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export function trimEdges(buffer, { threshold = 0.003, paddingSec = 0.25 } = {}) {
  const pcm = readPcmWav(buffer), samples = pcm.length / 2, frame = 320;
  let first = null, last = null;
  for (let start = 0; start < samples; start += frame) {
    const stop = Math.min(samples, start + frame); let sum = 0;
    for (let i = start; i < stop; i++) sum += (pcm.readInt16LE(i * 2) / 32768) ** 2;
    if (Math.sqrt(sum / (stop - start)) >= threshold) { first ??= start; last = stop; }
  }
  if (first === null) throw new Error('no_audible_signal');
  const start = Math.max(0, first - Math.round(paddingSec * 16000)), end = Math.min(samples, last + Math.round(paddingSec * 16000));
  return { audio: wav(pcm.subarray(start * 2, end * 2)), trimOffsetSec: start / 16000, durationSec: (end - start) / 16000, originalDurationSec: samples / 16000 };
}
export async function prepareAudio(file, { ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'presenttrack-audio-'));
  const output = join(directory, 'normalized.wav');
  try {
    await new Promise((yes, no) => {
      const proc = spawn(ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', resolve(file), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', '601', output], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { proc.kill(); no(new Error('audio_conversion_timeout')); }, 60000);
      proc.on('error', () => { clearTimeout(timer); no(new Error('ffmpeg_unavailable')); });
      proc.on('close', code => { clearTimeout(timer); code === 0 ? yes() : no(new Error('audio_conversion_failed')); });
    });
    const bytes = await readFile(output);
    if (readPcmWav(bytes).length / 32000 > 600) throw new Error('recording_exceeds_10_minutes');
    return trimEdges(bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export function audioChunks(audio, seconds = 60) {
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 120) throw new Error('invalid_chunk_duration');
  const pcm = readPcmWav(audio), size = seconds * 32000, chunks = [];
  for (let start = 0; start < pcm.length; start += size) {
    const part = pcm.subarray(start, Math.min(pcm.length, start + size));
    chunks.push({ audio: wav(part), mime: 'audio/wav', audioSeconds: part.length / 32000, offsetSec: start / 32000 });
  }
  return chunks;
}
