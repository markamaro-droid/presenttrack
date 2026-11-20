import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../server/admin.mjs';
import { createAdminHandler } from '../api/admin.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'secret' };
const admin = { id: 'administrator', app_metadata: { role: 'admin', must_change_password: false } };
const id = '8edc4387-59cf-4d9d-968e-c26337da1372';
const row = { id, source: 'upload', file_path: id + '/presentation.pptx', preview_path: null };
const body = { action: 'delete-library-presentation', id };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function setup(replies) {
  const calls = [];
  const service = createAdminService({ env, fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); assert.ok(replies.length, 'Unexpected request');
    const response = replies.shift(); if (response instanceof Error) throw response; return response;
  } });
  return { service, calls };
}

test('library deletion verifies admin, hides the deck and removes only its original and catalog entry', async () => {
  const s = setup([json(admin), json([row]), json({}), json([]), json({})]);
  assert.deepEqual(await s.service('Bearer verified', { ...body, file_path: 'another-user/private.pdf' }), { deleted: true });
  assert.equal(s.calls[0].headers.Authorization, 'Bearer verified');
  assert.equal(s.calls[2].method, 'PATCH');
  assert.deepEqual(JSON.parse(s.calls[2].body), { published: false });
  assert.equal(s.calls[3].url, env.SUPABASE_URL + '/storage/v1/object/presentation-library');
  assert.deepEqual(JSON.parse(s.calls[3].body), { prefixes: [row.file_path] });
  assert.equal(s.calls[4].method, 'DELETE');
  assert.equal(new URL(s.calls[4].url).searchParams.get('file_path'), 'eq.' + row.file_path);
  assert.equal(new URL(s.calls[4].url).searchParams.get('source'), 'eq.upload');
  for (const call of s.calls.slice(1)) { assert.equal(call.headers.apikey, 'secret'); assert.ok(call.signal); }
  assert.ok(s.calls.every(call => !/presentation-originals|presentation-previews|user_data|practice_sessions/.test(call.url)));
});

test('students, anonymous users and admins with an unchanged or missing password flag cannot delete', async () => {
  for (const user of [{ id: 'student', user_metadata: { role: 'admin' } }, { ...admin, is_anonymous: true }, { ...admin, app_metadata: { role: 'admin', must_change_password: true } }, { ...admin, app_metadata: { role: 'admin' } }]) {
    const s = setup([json(user)]);
    await assert.rejects(s.service('Bearer token', body), { status: 403 }); assert.equal(s.calls.length, 1);
  }
  const s = setup([json({}, 401)]); await assert.rejects(s.service('Bearer expired', body), { status: 401 }); assert.equal(s.calls.length, 1);
});

test('library deletion rejects malformed IDs before issuing privileged database queries', async () => {
  for (const invalid of ['', null, [], 'anything&id=gt.0', '../presentation.pdf']) {
    const s = setup([json(admin)]);
    await assert.rejects(s.service('Bearer token', { ...body, id: invalid }), { status: 400 }); assert.equal(s.calls.length, 1);
  }
});

test('library deletion protects built-in assets and refuses paths outside the exact uploaded deck', async () => {
  for (const edit of [{ source: 'builtin', file_path: 'assets/library/introduction.pptx' }, { id: 'other' }, { file_path: id + '/../private.pdf' }, { file_path: 'other/presentation.pdf' }, { file_path: id + '/subfolder/file.pdf' }, { preview_path: 'private.pdf' }]) {
    const s = setup([json(admin), json([{ ...row, ...edit }])]);
    await assert.rejects(s.service('Bearer token', body), { status: edit.source ? 403 : 409 }); assert.equal(s.calls.length, 2);
  }
});

test('missing decks are idempotent and unavailable catalog reads never delete storage', async () => {
  const missing = setup([json(admin), json([])]);
  assert.deepEqual(await missing.service('Bearer token', body), { deleted: true }); assert.equal(missing.calls.length, 2);
  for (const response of [json({}, 500), json({})]) {
    const s = setup([json(admin), response]); await assert.rejects(s.service('Bearer token', body), { status: 503 }); assert.equal(s.calls.length, 2);
  }
});

test('failed hide never deletes files; failed storage cleanup retains the hidden entry for retry', async () => {
  const hide = setup([json(admin), json([row]), json({}, 503)]);
  await assert.rejects(hide.service('Bearer token', body), { status: 503 }); assert.equal(hide.calls.length, 3);
  for (const failure of [json({}, 503), Error('timeout')]) {
    const s = setup([json(admin), json([row]), json({}), failure]);
    await assert.rejects(s.service('Bearer token', body), { code: 'library_delete_pending' }); assert.equal(s.calls.length, 4);
  }
});

test('a failed catalog delete can retry even when the file is already gone', async () => {
  const s = setup([json(admin), json([row]), json({}), json([]), json({}, 503), json(admin), json([row]), json({}), json([]), json({})]);
  await assert.rejects(s.service('Bearer token', body), { code: 'library_delete_pending' });
  assert.deepEqual(await s.service('Bearer token', body), { deleted: true });
});

test('admin handler returns a safe retry code without exposing provider errors or secrets', async () => {
  const s = setup([json(admin), json([row]), json({}), Error('provider detail secret')]);
  const res = { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
  await createAdminHandler(s.service)({ method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body }, res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'library_delete_pending');
  assert.doesNotMatch(JSON.stringify(res.body), /provider detail|secret/);
});
