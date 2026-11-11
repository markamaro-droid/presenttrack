// Run locally once. Never include this script or the service-role key in public assets.
import { pathToFileURL } from 'node:url';
const EMAIL = 'markamaro1234567@gmail.com';
const PASSWORD = 'admin1234';

function setupError(response, data) {
  const raw = data?.error_code || data?.code;
  const code = typeof raw === 'string' && /^[a-z_]{1,60}$/.test(raw) ? raw : '';
  const suffix = ` (HTTP ${response.status}${code ? ', ' + code : ''}).`;
  if ([401, 403].includes(response.status)) return Error('Supabase rejected admin access. Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY belong to the same project and that the key has admin access' + suffix);
  if (['weak_password', 'validation_failed'].includes(code)) return Error('Supabase rejected the initial credentials. Check the project password policy; admin1234 may not satisfy it' + suffix);
  if (['email_exists', 'user_already_exists'].includes(code)) return Error('That email is already registered. Rerun with --adopt-existing to make that account the initial admin without deleting its data' + suffix);
  if (response.status === 429) return Error('Supabase temporarily limited account setup. Wait before retrying' + suffix);
  return Error('Supabase could not complete admin setup. Check Authentication logs for the cause' + suffix);
}

export async function createInitialAdmin({ env = process.env, fetchImpl = fetch, adoptExisting = false } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  const base = env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/admin/users';
  async function request(path = '', method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(base + path, {
        method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
      });
    } catch { throw Error('Could not reach Supabase. Check your connection and SUPABASE_URL, then retry.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw setupError(response, data);
    if (!data || typeof data !== 'object') throw Error('Supabase returned an unreadable response. No further setup actions were attempted.');
    return data;
  }
  // Auth listUsers is paginated. Match the full email; never choose a name or first result.
  let existing, complete = false;
  for (let page = 1; page <= 1000; page++) {
    const data = await request(`?page=${page}&per_page=100`);
    if (!Array.isArray(data.users)) throw Error('Supabase returned an invalid account list. No account was changed.');
    existing = data.users.find(user => user.email?.toLowerCase() === EMAIL);
    if (existing || data.users.length < 100) { complete = true; break; }
  }
  if (!complete) throw Error('Account lookup exceeded its limit. No account was changed.');
  if (existing) {
    if (!existing.id || existing.is_anonymous) throw Error('The matching account cannot be used for admin setup. No account was changed.');
    if (existing.app_metadata?.role === 'admin') return { created: false, alreadyAdmin: true };
    if (!adoptExisting) throw Error(`${EMAIL} already has an account. To make it the admin and set the requested initial password while retaining its data, run: node --env-file=.env.local tools/create-admin.mjs --adopt-existing`);
    await request('/' + encodeURIComponent(existing.id), 'PUT', {
      password: PASSWORD, email_confirm: true,
      app_metadata: { ...existing.app_metadata, role: 'admin', must_change_password: true }
    });
    return { created: false, promoted: true };
  }
  await request('', 'POST', { email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: 'Administrator' }, app_metadata: { role: 'admin', must_change_password: true } });
  return { created: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--adopt-existing')) throw Error('Supported option: --adopt-existing.');
    const result = await createInitialAdmin({ adoptExisting: args.includes('--adopt-existing') });
    if (result.alreadyAdmin) console.log(`${EMAIL} is already an admin. Its password and data were left unchanged. Sign in with its current password.`);
    else console.log(`${result.promoted ? 'Existing account upgraded to admin; its account ID and data were retained.' : 'Initial admin created.'} Sign in with ${EMAIL} and the requested initial password, then change it in the Admin Dashboard.`);
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
