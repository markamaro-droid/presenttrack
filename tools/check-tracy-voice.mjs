// Read-only voice diagnostics. Never print keys, user identities or stored speech.
// node --env-file=.env.local tools/check-tracy-voice.mjs
const env = process.env;
const results = await Promise.allSettled([
  (async () => {
    if (!env.CARTESIA_API_KEY || !env.CARTESIA_VOICE_ID) return { check: 'voice', configured: false };
    const response = await fetch('https://api.cartesia.ai/voices/' + encodeURIComponent(env.CARTESIA_VOICE_ID.trim()), { headers: { Authorization: 'Bearer ' + env.CARTESIA_API_KEY.trim(), 'Cartesia-Version': '2026-08-14' }, signal: AbortSignal.timeout(15000) });
    return { check: 'voice-access', status: response.status, available: response.ok };
  })(),
  (async () => {
    const response = await fetch('https://api.cartesia.ai/models', { headers: { Authorization: 'Bearer ' + env.CARTESIA_API_KEY?.trim(), 'Cartesia-Version': '2026-08-14' }, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data) ? data : data.data || data.models || [];
    return { check: 'model', status: response.status, configuredModel: env.CARTESIA_MODEL || 'sonic-3.6-2026-08-27', listed: Array.isArray(models) && models.some(m => (m.id || m.model_id) === (env.CARTESIA_MODEL || 'sonic-3.6-2026-08-27')), ttsModels: Array.isArray(models) ? models.filter(m => m.capability === 'tts').map(m => m.id).slice(0, 20) : [] };
  })(),
  (async () => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return { check: 'storage', configured: false };
    const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
    const response = await fetch(env.SUPABASE_URL + '/storage/v1/bucket/tracy-speech-cache', { headers, signal: AbortSignal.timeout(15000) });
    const bucket = await response.json().catch(() => ({}));
    return { check: 'storage', status: response.status, private: bucket.public === false };
  })(),
  (async () => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return { check: 'usage', configured: false };
    const response = await fetch(env.SUPABASE_URL + '/rest/v1/ai_usage?select=user_id,created_at&kind=eq.tracy_speech&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 86400000).toISOString()) + '&limit=5000', { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }, signal: AbortSignal.timeout(15000) });
    const rows = await response.json().catch(() => []), counts = new Map();
    if (Array.isArray(rows)) for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
    return { check: 'usage', status: response.status, requests24h: Array.isArray(rows) ? rows.length : null, highestAccount24h: Math.max(0, ...counts.values()) };
  })()
]);
for (const result of results) console.log(JSON.stringify(result.status === 'fulfilled' ? result.value : { check: 'network', error: result.reason?.name || 'Failed' }));
// Explicit diagnostic only: six characters, never real conversation text.
if (process.argv.includes('--sample')) {
  const model = process.argv.find(arg => arg.startsWith('--model='))?.slice(8) || env.CARTESIA_MODEL;
  const response = await fetch('https://api.cartesia.ai/tts/bytes', { method: 'POST', headers: { Authorization: 'Bearer ' + env.CARTESIA_API_KEY.trim(), 'Cartesia-Version': '2026-08-14', 'Content-Type': 'application/json' }, body: JSON.stringify({ model_id: model, voice: env.CARTESIA_VOICE_ID.trim(), transcript: 'Hello.', language: 'en', output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 16000 } }), signal: AbortSignal.timeout(30000) });
  const buffer = Buffer.from(await response.arrayBuffer());
  const error = response.ok ? '' : buffer.toString('utf8').toLowerCase();
  console.log(JSON.stringify({ check: 'sample', model, status: response.status, validWav: buffer.subarray(0, 4).toString() === 'RIFF', reason: /credit|balance/.test(error) ? 'credits' : /model/.test(error) ? 'model' : /voice/.test(error) ? 'voice' : /permission|access|unauthor/.test(error) ? 'access' : response.ok ? null : 'provider' }));
}
