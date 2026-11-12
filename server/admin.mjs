import { ChatError } from './ai-access.mjs';

export function validateCredentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!body || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
      typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 128 ||
      typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128 || body.password === body.currentPassword) {
    throw new ChatError(400, 'invalid_credentials', 'Use a valid email address and a new password of 12 to 128 characters.');
  }
  return { ...body, email };
}

export function createAdminService({ env = process.env, fetchImpl = fetch } = {}) {
  return async (authorization, body) => {
    if (!/^Bearer [^\s]+$/i.test(authorization || '') || authorization.length > 8200) throw new ChatError(401, 'unauthorized', 'Please sign in again.');
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ChatError(503, 'setup_required', 'Administrator tools need server setup. Check the Supabase server environment variables.');
    const base = env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1';
    const call = (path, options) => fetchImpl(base + path, { ...options, signal: AbortSignal.timeout(10000) });
    const checked = await call('/user', { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } });
    if (!checked.ok) throw new ChatError(401, 'unauthorized', 'Please sign in again.');
    const user = await checked.json();
    // This metadata is controlled by the server, never user_metadata or a request body.
    if (!user.id || user.is_anonymous || user.app_metadata?.role !== 'admin') throw new ChatError(403, 'forbidden', 'Administrator access required.');
    if (body?.action === 'overview') {
      if (user.app_metadata.must_change_password !== false) throw new ChatError(403, 'password_change_required', 'Change your initial admin password before opening system monitoring. You can still browse published library presentations.');
      const page = body.page ?? 1, query = body.query ?? '', filter = body.filter ?? 'all';
      if (!Number.isInteger(page) || page < 1 || page > 100000 || typeof query !== 'string' || query.length > 120 || !['all','student','admin','completed','pending'].includes(filter)) throw new ChatError(400, 'invalid_filters', 'Choose valid user filters and a search of up to 120 characters.');
      const response = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/admin_system_overview', {
        method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_page: page, p_query: query.trim(), p_filter: filter }), signal: AbortSignal.timeout(15000)
      });
      if ([404,403].includes(response.status)) throw new ChatError(503, 'monitoring_setup_required', 'System monitoring needs the 20261111_admin_monitoring.sql migration in Supabase.');
      if (!response.ok) throw new ChatError(503, 'monitoring_unavailable', 'System monitoring could not load. Please retry.');
      const data = await response.json();
      if (!data?.summary || !Array.isArray(data.users) || !data.pagination) throw new ChatError(503, 'monitoring_unavailable', 'System monitoring returned an incomplete response. Please retry.');
      return { ...data, configuration: { database: true, transcription: !!env.GROQ_API_KEY?.trim(), fillerCheck: !!env.GEMINI_API_KEY?.trim(), speech: !!env.CARTESIA_API_KEY?.trim() } };
    }
    if (body?.action && body.action !== 'credentials') throw new ChatError(400, 'invalid_action', 'Unknown admin action.');
    const { email, currentPassword, password } = validateCredentials(body);
    const verified = await call('/token?grant_type=password', { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: currentPassword }) });
    if (!verified.ok) throw new ChatError(verified.status === 429 ? 429 : 401, 'password_verification_failed', verified.status === 429 ? 'Too many attempts. Please wait before retrying.' : 'The current password could not be verified.');
    const session = await verified.json();
    if (session.user?.id !== user.id) throw new ChatError(403, 'forbidden', 'Account verification failed.');
    // Discard the temporary reauthentication session; do not return its tokens.
    if (session.access_token) await call('/logout?scope=local', { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token } });
    const changed = await call('/admin/users/' + encodeURIComponent(user.id), {
      method: 'PUT', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, email_confirm: true, password, app_metadata: { ...user.app_metadata, role: 'admin', must_change_password: false } })
    });
    if (!changed.ok) throw new ChatError(400, 'update_failed', 'Could not update credentials. The email address may be in use or the password may not meet your account policy.');
    return { updated: true, email };
  };
}
