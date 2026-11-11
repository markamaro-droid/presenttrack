// Run locally once. Never include this script or the service-role key in public assets.
import { pathToFileURL } from 'node:url';
export async function createInitialAdmin({ env = process.env, fetchImpl = fetch } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  const response = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/admin/users', {
    method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'markamaro1234567@gmail.com', password: 'admin1234', email_confirm: true, user_metadata: { full_name: 'Administrator' }, app_metadata: { role: 'admin', must_change_password: true } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error('Admin creation failed. Check the project and its password policy. If the account already exists, sign in with its current credentials. This script never resets or promotes an existing account.');
  return { created: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await createInitialAdmin(); console.log('Initial admin created. Sign in with markamaro1234567@gmail.com and the requested initial password, then change it immediately in the Admin dashboard.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
