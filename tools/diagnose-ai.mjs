// Read-only checks. Never print credentials, bearer tokens, or upstream error messages.
import { readFile } from 'node:fs/promises';
import { createVoiceService } from '../server/voice.mjs';
const env = process.env;
const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const publicKey = env.SUPABASE_ANON_KEY || config.match(/anonKey:\s*"([^"]+)"/)?.[1];
for (const key of ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) console.log(`${key}: ${env[key]?.trim() ? 'SET' : 'MISSING'}`);
const checks = [
  ['OpenAI text model access', 'https://api.openai.com/v1/models/' + encodeURIComponent(env.OPENAI_MODEL || 'gpt-4o-mini'), { headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY } }],
  ['OpenAI realtime model access', 'https://api.openai.com/v1/models/' + encodeURIComponent(env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1'), { headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY } }],
  ['OpenAI caption model access', 'https://api.openai.com/v1/models/' + encodeURIComponent(env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'), { headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY } }],
  ['Tracy quota RPC (anonymous role must be denied)', env.SUPABASE_URL + '/rest/v1/rpc/take_tracy_slot', { method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_kind: 'voice' }) }]
];
for (const [name, url, options] of checks) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    const data = await response.json().catch(() => ({}));
    const code = response.ok ? 'OK' : String(data.code || data.error?.code || 'unknown').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
    console.log(JSON.stringify({ check: name, status: response.status, code }));
  } catch (error) { console.log(JSON.stringify({ check: name, error: error.cause?.code || error.name })); }
}
for (const authorization of ['', 'Bearer deliberately-invalid-test-token']) {
  try {
    await createVoiceService() (authorization, { sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' });
    console.log('ERROR: invalid credentials were accepted'); process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ check: authorization ? 'Backend rejects invalid Supabase token' : 'Backend rejects missing token', status: error.status || 503, code: error.code || 'network_failure' }));
  }
}
