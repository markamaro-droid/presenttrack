// Read-only public asset check. No account, microphone or provider requests.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const site = new URL(process.argv[2]);
if (site.username || site.password || !(site.protocol === 'https:' || (site.protocol === 'http:' && ['localhost','127.0.0.1'].includes(site.hostname)))) throw Error('Use a public HTTPS URL or localhost.');
const read = async path => {
  const response = await fetch(new URL(path, site), { signal: AbortSignal.timeout(15000), cache:'no-store' });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return response.text();
};
const hash = text => createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
try {
  const html = await read('/');
  const scripts = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  for (const local of ['js/cloud.js','js/evaluation.js','js/dashboard.js','supabase/functions/_shared/report.js','supabase/functions/_shared/feedback.js']) {
    const prefix = local.replace(/\.js$/, '.');
    const deployed = local.startsWith('js/') ? scripts.find(p => p === local || p.startsWith(prefix)) : local;
    if (!deployed) { console.log(`OUTDATED: page does not load ${local}`); process.exitCode=1; continue; }
    const current = await readFile(new URL('../'+local, import.meta.url), 'utf8');
    try {
      const contents = await read(deployed);
      const matches = hash(contents) === hash(current);
      console.log(`${matches?'CURRENT':'OUTDATED'}: ${local}`);
      if (local==='js/cloud.js' && contents.includes("sb.rpc('complete_browser_evaluation'")) {
        console.log('SAVE CONFLICT: this app calls complete_browser_evaluation, which the recorded-evaluation migration revokes. Deploy the current app before retaking; do not restore the obsolete save permission.');
      }
      if (!matches) process.exitCode=1;
    } catch (error) { console.log(`UNAVAILABLE: ${local} (${error.message})`); process.exitCode=1; }
  }
  console.log('This verifies public report assets only. Backend deployment, database migration and live audio accuracy require separate verification.');
} catch (error) { console.error(error.message); process.exitCode=1; }
