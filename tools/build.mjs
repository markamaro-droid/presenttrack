import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
// Fixed, workspace-local generated directory. Never copy the project root or env files.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'css', 'js', 'assets']) {
  await cp(path.join(root, file), path.join(out, file), { recursive: true });
}
// Browser evaluation imports these existing modules dynamically.
const shared = 'supabase/functions/_shared';
await mkdir(path.join(out, shared), { recursive: true });
for (const name of ['metrics', 'quality', 'classify', 'feedback', 'criteria', 'baseline']) {
  await cp(path.join(root, shared, name + '.js'), path.join(out, shared, name + '.js'));
}
// Fingerprinted files can be cached indefinitely; HTML always points to the
// matching version. Keep originals for runtime imports and relative references.
let html = await readFile(path.join(out, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="((?:js|css|assets)\/[^"?]+\.(?:js|css))"/g)].map(m => m[1]);
for (const relative of new Set(references)) {
  if (relative === 'js/config.js') continue;
  const bytes = await readFile(path.join(out, relative));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0,16);
  const extension = path.extname(relative);
  const versioned = relative.slice(0,-extension.length) + '.' + hash + extension;
  await writeFile(path.join(out, versioned), bytes);
  html = html.replaceAll('"' + relative + '"', '"' + versioned + '"');
}
await writeFile(path.join(out, 'index.html'), html);
console.log('Built versioned public assets in dist (server code and secrets excluded).');
