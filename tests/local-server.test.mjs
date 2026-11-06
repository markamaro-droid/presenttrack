import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('local server serves existing modules and API without exposing server or secret files', async t => {
  const port = 19000 + Math.floor(Math.random() * 10000);
  const server = spawn(process.execPath, ['tools/dev.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  t.after(() => server.kill());
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(([code]) => { throw new Error('Dev server exited: ' + code); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Dev server startup timeout')), 10000); timer.unref(); })
  ]);
  const base = `http://127.0.0.1:${port}`;
  for (const path of ['/', '/js/robot.js', '/js/browser-voice-session.js', '/js/voice-session.js', '/js/robot-voice.js', '/css/robot-voice.css', '/supabase/functions/_shared/metrics.js']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  for (const path of ['/.env.local', '/.env.example', '/server/chat.mjs', '/api/chat.js', '/.git/config', '/supabase/functions/_shared/edge.ts']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const unauthorized = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"Hello"}' });
  assert.equal(unauthorized.status, 401);
  const unavailable = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-test-token' }, body: '{"message":"Hello"}' });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(base + '/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"start"}' })).status, 401);
});
