import { ChatError } from './ai-access.mjs';

export const adminEmail = username => `${username}@admin.presenttrack.invalid`;
export function validateCredentials(body) {
  if (!body || !/^[a-z][a-z0-9_-]{2,31}$/.test(body.username || '') ||
      typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 128 ||
      typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128 || body.password === body.currentPassword) {
    throw new ChatError(400, 'invalid_credentials', 'Use a username of 3–32 lowercase letters, numbers, underscores or hyphens, starting with a letter, and a new password of 12–128 characters.');
  }
  return body;
}

export function createAdminService({ env = process.env, fetchImpl = fetch } = {}) {
  return async (authorization, body) => {
    if (!/^Bearer [^\s]+$/i.test(authorization || '') || authorization.length > 8200) throw new ChatError(401, 'unauthorized', 'Please sign in again.');
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ChatError(503, 'setup_required', 'Administrator account updates need server setup.');
    const base = env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1';
    const call = (path, options) => fetchImpl(base + path, { ...options, signal: AbortSignal.timeout(10000) });
    const checked = await call('/user', { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } });
    if (!checked.ok) throw new ChatError(401, 'unauthorized', 'Please sign in again.');
    const user = await checked.json();
    // This metadata is controlled by the server, never user_metadata or a request body.
    if (!user.id || user.is_anonymous || user.app_metadata?.role !== 'admin') throw new ChatError(403, 'forbidden', 'Administrator access required.');
    const { username, currentPassword, password } = validateCredentials(body);
    const verified = await call('/token?grant_type=password', { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: currentPassword }) });
    if (!verified.ok) throw new ChatError(verified.status === 429 ? 429 : 401, 'password_verification_failed', verified.status === 429 ? 'Too many attempts. Please wait before retrying.' : 'The current password could not be verified.');
    const session = await verified.json();
    if (session.user?.id !== user.id) throw new ChatError(403, 'forbidden', 'Account verification failed.');
    // Discard the temporary reauthentication session; do not return its tokens.
    if (session.access_token) await call('/logout?scope=local', { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token } });
    const changed = await call('/admin/users/' + encodeURIComponent(user.id), {
      method: 'PUT', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail(username), email_confirm: true, password, app_metadata: { ...user.app_metadata, role: 'admin', must_change_password: false } })
    });
    if (!changed.ok) throw new ChatError(400, 'update_failed', 'Could not update credentials. The username may be in use or the password may not meet your account policy.');
    return { updated: true, username };
  };
}
