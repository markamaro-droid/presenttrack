import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createAdminService, validateCredentials } from '../server/admin.mjs';
import { createAdminHandler } from '../api/admin.js';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'private-key' };
const credentials = { email: 'owner@example.com', currentPassword: 'admin1234', password: 'new-long-password-123' };
const admin = { id: 'admin-id', email: 'markamaro1234567@gmail.com', app_metadata: { role: 'admin', must_change_password: true } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function setup(responses) {
  const calls = [];
  const service = createAdminService({ env, fetchImpl: async (url, options) => { calls.push({ url, ...options }); assert.ok(responses.length, 'unexpected request'); return responses.shift(); } });
  return { service, calls };
}
test('admin update verifies server identity and current password before changing credentials', async () => {
  const s = setup([json(admin), json({ user: { id: admin.id }, access_token: 'temporary' }), json({}), json(admin)]);
  assert.deepEqual(await s.service('Bearer original', credentials), { updated: true, email: 'owner@example.com' });
  assert.equal(s.calls[0].headers.Authorization, 'Bearer original');
  assert.equal(JSON.parse(s.calls[1].body).password, 'admin1234');
  assert.match(s.calls[2].url, /logout\?scope=local$/);
  const mutation = s.calls[3]; assert.match(mutation.url, /admin\/users\/admin-id$/);
  assert.equal(mutation.headers.apikey, 'private-key');
  const body = JSON.parse(mutation.body);
  assert.equal(body.email, 'owner@example.com'); assert.equal(body.password, credentials.password);
  assert.equal(body.app_metadata.must_change_password, false); assert.equal(body.app_metadata.role, 'admin');
});
test('student, anonymous and user-metadata role claims never authorize admin changes', async () => {
  for (const user of [{ id: 'student', user_metadata: { role: 'admin' } }, { ...admin, is_anonymous: true }, { id: 'student', app_metadata: { role: 'student' } }]) {
    const s = setup([json(user)]);
    await assert.rejects(s.service('Bearer token', { ...credentials, role: 'admin' }), { status: 403 });
    assert.equal(s.calls.length, 1);
  }
});
test('bad current password, expired token and wrong reauthentication identity do not mutate', async () => {
  for (const replies of [[json({}, 401)], [json(admin), json({}, 400)], [json(admin), json({ user: { id: 'other' } })]]) {
    const s = setup(replies); await assert.rejects(s.service('Bearer token', credentials));
    assert.ok(s.calls.every(call => call.method !== 'PUT'));
  }
});
test('credential validation bounds input and forbids preserving the initial password', () => {
  for (const edit of [{ email: 'admin' }, { email: 'invalid@' }, { email: 'a'.repeat(250)+'@example.com' }, { password: 'short' }, { password: 'admin1234' }, { password: 'x'.repeat(129) }, { currentPassword: '' }]) {
    assert.throws(() => validateCredentials({ ...credentials, ...edit }), { status: 400 });
  }
});
test('admin API refuses wrong methods, anonymous calls, large or malformed input', async () => {
  let calls = 0;
  for (const [method, authorization, body, expected] of [['GET', 'Bearer test', '{}', 405], ['POST', '', '{}', 401], ['POST', 'Bearer test', '{', 400], ['POST', 'Bearer test', 'x'.repeat(4097), 413]]) {
    const req = { method, headers: { authorization, 'content-type': 'application/json' }, body };
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await createAdminHandler(async () => { calls++; })(req, res); assert.equal(res.statusCode, expected);
  }
  assert.equal(calls, 0);
});
test('email alone and editable metadata never grant administrator authority', async () => {
  const context = {}; vm.runInNewContext(await readFile(new URL('../js/identity.js', import.meta.url), 'utf8'), context);
  const identity = context.PTIdentity;
  assert.equal(identity.isAdmin({ id: 'student', email: 'markamaro1234567@gmail.com' }), false);
  assert.equal(identity.isAdmin({ id: 'student', user_metadata: { role: 'admin' } }), false);
  assert.equal(identity.isAdmin(admin), true); assert.equal(identity.mustChange(admin), true);
});

test('admin email is normalized before updating the account', () => {
  assert.equal(validateCredentials({ ...credentials, email: '  Owner@Example.COM ' }).email, 'owner@example.com');
});
