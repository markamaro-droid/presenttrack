import { cp, mkdir, rm } from 'node:fs/promises';
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
console.log('Built public assets in dist (server code and secrets excluded).');
