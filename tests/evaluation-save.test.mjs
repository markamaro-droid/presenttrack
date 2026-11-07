import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/cloud.js', import.meta.url), 'utf8');
function setup(error) {
  const calls = [];
  const sb = { auth: { onAuthStateChange() {} }, rpc: async (name, args) => { calls.push({ name, args }); return { error }; } };
  const window = { PT_SUPABASE: { url: 'https://example.test', anonKey: 'test' }, supabase: { createClient: () => sb } };
  vm.runInNewContext(source, { window, setInterval() {}, document: { addEventListener() {}, querySelectorAll: () => [] } });
  return { cloud: window.PTCloud, calls };
}
test('missing RPC permits retry and does not unlock uploads', async () => {
  const { cloud } = setup({ code: 'PGRST202', message: 'Missing function' });
  cloud.user = { id: 'user-a' };
  const response = await cloud.completeEvaluation({ score: 70 });
  assert.equal(response.retryable, true);
  assert.equal(cloud.assessmentDone, false);
});
test('baseline save requires authentication and uses the expected RPC argument', async () => {
  const { cloud, calls } = setup(null);
  assert.ok((await cloud.completeEvaluation({})).error);
  assert.equal(calls.length, 0);
  cloud.user = { id: 'user-a' };
  const results = { score: 70 };
  await cloud.completeEvaluation(results);
  assert.equal(calls[0].name, 'complete_browser_evaluation');
  assert.equal(calls[0].args.p_results, results);
  assert.equal(cloud.assessmentDone, true);
});
test('invalid results cannot be retried as a valid baseline', async () => {
  const { cloud } = setup({ message: 'invalid_evaluation' });
  cloud.user = { id: 'user-a' };
  assert.equal((await cloud.completeEvaluation({})).invalid, true);
  assert.equal(cloud.assessmentDone, false);
});
