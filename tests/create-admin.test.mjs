import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAdmin } from '../tools/create-admin.mjs';
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-key' };
const email = 'markamaro1234567@gmail.com';
const account = { id: 'existing-user', email, user_metadata: { full_name: 'Existing name' }, app_metadata: { provider: 'email', providers: ['email'] } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function setup(responses) {
  const calls = [];
  return { calls, run: options => createInitialAdmin({ env, ...options, fetchImpl: async (url, request) => {
    calls.push({ url, ...request }); assert.ok(responses.length, 'unexpected request'); return responses.shift();
  } }) };
}
test('new admin gets the requested email/password and must change password on first login', async () => {
  const s = setup([json({ users: [] }), json({ id: 'new-admin' })]);
  assert.deepEqual(await s.run(), { created: true });
  const mutation = s.calls[1], body = JSON.parse(mutation.body);
  assert.equal(mutation.method, 'POST'); assert.equal(body.email, email); assert.equal(body.password, 'admin1234');
  assert.deepEqual(body.app_metadata, { role: 'admin', must_change_password: true });
});
test('ordinary rerun identifies existing email without changing credentials or roles', async () => {
  const s = setup([json({ users: [account] })]);
  await assert.rejects(s.run(), /--adopt-existing/); assert.equal(s.calls.length, 1); assert.equal(s.calls[0].method, 'GET');
});
test('explicit adoption updates only the exact account and preserves profile and other app metadata', async () => {
  const s = setup([json({ users: [{ id: 'other', email: 'markamaro@example.com' }, account] }), json(account)]);
  assert.deepEqual(await s.run({ adoptExisting: true }), { created: false, promoted: true });
  assert.equal(s.calls.length, 2); assert.match(s.calls[1].url, /\/existing-user$/); assert.equal(s.calls[1].method, 'PUT');
  const body = JSON.parse(s.calls[1].body);
  assert.deepEqual(body, { password: 'admin1234', email_confirm: true, app_metadata: { provider: 'email', providers: ['email'], role: 'admin', must_change_password: true } });
  assert.ok(s.calls.every(call => !call.url.includes('/rest/') && !call.url.includes('/storage/')));
});
test('repeating setup for an existing admin never restores the default password', async () => {
  for (const adoptExisting of [false, true]) {
    const s = setup([json({ users: [{ ...account, app_metadata: { role: 'admin', must_change_password: false } }] })]);
    assert.deepEqual(await s.run({ adoptExisting }), { created: false, alreadyAdmin: true }); assert.equal(s.calls.length, 1);
  }
});
test('account lookup paginates and matches the full email case-insensitively', async () => {
  const s = setup([json({ users: Array.from({ length: 100 }, (_, i) => ({ id: String(i), email: `other${i}@example.com` })) }), json({ users: [{ ...account, email: email.toUpperCase() }] })]);
  await assert.rejects(s.run(), /--adopt-existing/); assert.match(s.calls[1].url, /page=2&per_page=100$/); assert.equal(s.calls.length, 2);
});
test('upstream errors identify key, policy and database failures without exposing response secrets', async () => {
  for (const [status, code, pattern] of [[401, 'bad_jwt', /rejected admin access/], [422, 'weak_password', /password policy/], [500, 'unexpected_failure', /Authentication logs/]]) {
    const s = setup([json({ error_code: code, message: 'private-key raw database detail' }, status)]);
    await assert.rejects(s.run({ adoptExisting: true }), error => {
      assert.match(error.message, pattern); assert.match(error.message, new RegExp(code));
      assert.doesNotMatch(error.message, /private-key|raw database detail/); return true;
    }); assert.equal(s.calls.length, 1);
  }
});
test('bad account lists cannot lead to creating or adopting an account', async () => {
  const s = setup([json({})]); await assert.rejects(s.run({ adoptExisting: true }), /invalid account list/); assert.equal(s.calls.length, 1);
});
