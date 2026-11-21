import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryPreview } from '../server/library-preview.mjs';
import { createPresentationsService } from '../server/presentations.mjs';
import { ChatError } from '../server/ai-access.mjs';
const admin = { id: '11111111-1111-4111-8111-111111111111', app_metadata: { role: 'admin', must_change_password: false } };
const student = { id: '22222222-2222-4222-8222-222222222222', app_metadata: { role: 'student' } };
const id = '33333333-3333-4333-8333-333333333333', pid = '44444444-4444-4444-8444-444444444444', cache = '55555555-5555-4555-8555-555555555555';
function fixture({ rowPatch = {}, presentationPatch = {}, missing = false, hiddenDuring = false } = {}) {
  const row = { id, source: 'upload', file_name: 'talk.pptx', file_path: id + '/presentation.pptx', published: true, ...rowPatch };
  const presentation = { id: pid, user_id: admin.id, library_entry_id: id, file_type: 'pptx', original_file_path: admin.id + '/' + pid + '.pptx',
    conversion_consent_at: '2026-11-20T00:00:00Z', upload_completed: true, conversion_status: 'completed', conversion_id: cache, preview_pdf_path: admin.id + '/cache/' + cache + '.pdf', total_slides: 5, warnings: [], ...presentationPatch };
  const calls = [], db = {
    json: async path => { calls.push(['json', path]); if (path.includes('/presentation_library?')) return hiddenDuring && path.endsWith('&select=id,published') ? [] : [row]; return missing ? [] : [presentation]; },
    rpc: async (name, args) => { calls.push([name, args]); if (name === 'library_preview_submit') presentation.upload_completed = true; return presentation; },
    copy: async (...args) => calls.push(['copy', ...args]),
    presentation: async () => presentation,
    sign: async (...args) => { calls.push(['sign', ...args]); return 'https://private.example/temporary.pdf'; }
  };
  const conversion = { db, advance: async id => calls.push(['advance', id]), retry: async (...args) => { calls.push(['retry', ...args]); return true; } };
  const run = (action = 'library-preview', user = admin, extra = {}) => libraryPreview({ body: { action, id, ...extra }, user, conversion });
  return { run, calls, db, presentation, conversion };
}
test('PDF previews sign the private original without making a conversion job', async () => {
  const f = fixture({ rowPatch: { file_name: 'talk.pdf', file_path: id + '/presentation.pdf' } });
  assert.equal((await f.run()).preview.state, 'completed');
  assert.deepEqual(f.calls.filter(c => c[0] !== 'json'), [['sign', 'presentation-library', id + '/presentation.pdf']]);
});
test('completed PowerPoint previews reuse the cached PDF for admins and published student access', async () => {
  for (const user of [admin, student]) {
    const f = fixture(), result = await f.run('library-preview', user);
    assert.equal(result.preview.totalSlides, 5);
    assert.deepEqual(f.calls.filter(c => c[0] !== 'json'), [['sign', 'presentation-previews', admin.id + '/cache/' + cache + '.pdf']]);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(admin.id + '|' + pid));
  }
});
test('unprepared files do not start a conversion on view and only admins can prepare or retry', async () => {
  const f = fixture({ missing: true }); assert.equal((await f.run()).preview.state, 'not_prepared');
  assert.equal(f.calls.some(c => c[0] === 'advance' || c[0].startsWith('library_preview_')), false);
  for (const user of [student, { ...admin, app_metadata: { role: 'admin', must_change_password: true } }]) for (const action of ['library-prepare', 'library-retry']) await assert.rejects(f.run(action, user), { status: 403 });
});
test('preparing uses the stored paths, verifies storage copy, then advances the shared queue', async () => {
  const f = fixture({ missing: true, presentationPatch: { upload_completed: false, conversion_status: 'processing' } });
  await f.run('library-prepare', admin, { cloudconvertConsent: true, file_path: 'another-user/private.pptx' });
  assert.deepEqual(f.calls.filter(c => c[0] !== 'json'), [
    ['library_preview_prepare', { p_library: id, p_admin: admin.id, p_consent: true }],
    ['copy', 'presentation-library', id + '/presentation.pptx', 'presentation-originals', admin.id + '/' + pid + '.pptx'],
    ['library_preview_submit', { p_id: pid }], ['advance', pid]
  ]);
});
test('hidden, deleted and invalid preview paths never produce signed downloads', async () => {
  for (const options of [{ rowPatch: { published: false } }, { hiddenDuring: true }, { presentationPatch: { preview_pdf_path: 'another-user/private.pdf' } }, { presentationPatch: { original_file_path: 'another-user/private.pptx' } }, { rowPatch: { file_path: id + '/../private.pptx' } }]) {
    const f = fixture(options); await assert.rejects(f.run('library-preview', student)); assert.equal(f.calls.some(c => c[0] === 'sign'), false);
  }
});
test('quota and failure states stay visible without creating duplicate jobs', async () => {
  const f = fixture({ presentationPatch: { conversion_status: 'queued', conversion_error: 'Daily allowance used', error_code: 'daily_quota', available_at: '2026-11-21T00:05:00Z' } });
  const result = await f.run(); assert.equal(result.preview.errorCode, 'daily_quota'); assert.equal(result.preview.nextCheckAt, '2026-11-21T00:05:00Z');
  assert.equal(f.calls.some(c => c[0] === 'copy' || c[0] === 'library_preview_prepare'), false);
  const retry = fixture({ presentationPatch: { conversion_status: 'failed', retryable: true } }); await retry.run('library-retry'); assert.ok(retry.calls.some(c => c[0] === 'retry' && c[1] === pid && c[2] === admin.id));
});
test('thumbnail requests never copy files, advance conversions or retry jobs', async () => {
  for (const state of ['queued', 'processing', 'failed']) {
    const f = fixture({ presentationPatch: { conversion_status: state, upload_completed: false } });
    assert.equal((await f.run('library-preview', student, { thumbnail: true })).preview.state, state);
    assert.ok(f.calls.every(call => call[0] === 'json'));
  }
});
test('missing Library migration gives the exact setup instruction', async () => {
  const f = fixture(), json = f.db.json;
  f.db.json = async path => { if (path.startsWith('/rest/v1/presentations?')) throw new ChatError(503, 'storage_schema_missing', 'Missing column'); return json(path); };
  await assert.rejects(f.run(), /20261120_library_previews.sql/);
});
test('presentation API authenticates Library requests and requires explicit conversion consent', async () => {
  const f = fixture({ missing: true }), env = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public' };
  const service = createPresentationsService({ env, conversion: f.conversion, fetchImpl: async () => Response.json(admin) });
  await assert.rejects(service('', { action: 'library-preview', id }), { status: 401 });
  await assert.rejects(service('Bearer test', { action: 'library-prepare', id }), { code: 'conversion_consent_required' });
  assert.equal((await service('Bearer test', { action: 'library-preview', id })).preview.state, 'not_prepared');
});
