import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('built-in catalog contains usable PowerPoint files, PDF previews and matching slide context', async () => {
  const rows = JSON.parse(await readFile(new URL('assets/library/catalog.json', root)));
  assert.equal(rows.length, 3); assert.equal(new Set(rows.map(row => row.id)).size, 3);
  for (const row of rows) {
    const pptx = await readFile(new URL(row.file_path, root)), pdf = await readFile(new URL(row.preview_path, root));
    assert.equal(pptx.subarray(0,2).toString(), 'PK'); assert.equal(row.file_size, pptx.length);
    assert.match(pdf.toString(), /^%PDF-1.4/); assert.match(pdf.toString(), /\/Count 5/);
    assert.equal(row.context.pages.length, 5); assert.equal(row.context.text, row.context.pages.join('\n'));
    assert.ok(row.context.text.length > 300); assert.equal(row.published, true);
  }
});
