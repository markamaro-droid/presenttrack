// No service-role key is needed: the quota RPC derives identity from auth.uid().
export class ChatError extends Error {
  constructor(status, code, message, retryAfter) { super(message); Object.assign(this, { status, code, retryAfter }); }
}
export function createAccess({ env = process.env, fetchImpl = fetch } = {}) {
  async function authenticate(authorization) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization || '');
    if (!match || match[1].length > 8192) throw new ChatError(401, 'unauthorized', 'Please sign in again to talk with Tracy.');
    if (!env.OPENAI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new ChatError(503, 'setup_required', 'Tracy is not set up yet. Please contact the site owner.');
    const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${match[1]}` };
    const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) throw new ChatError(401, 'unauthorized', 'Please sign in again to talk with Tracy.');
      throw new ChatError(503, 'auth_unavailable', 'Sign-in verification is unavailable. Please try again shortly.');
    }
    const user = await response.json();
    if (!user?.id || user.is_anonymous) throw new ChatError(401, 'unauthorized', 'Please sign in with your PresentTrack account.');
    return { userId: user.id, headers };
  }
  async function quota(identity, kind) {
    const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/take_tracy_slot`, {
      method: 'POST', headers: { ...identity.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind }), signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404 || response.status === 403) throw new ChatError(503, 'setup_required', 'Tracy is not set up yet. Please contact the site owner.');
    const data = response.ok ? await response.json() : null;
    if (!data || typeof data.allowed !== 'boolean') throw new ChatError(503, 'quota_unavailable', 'Tracy cannot check usage right now. Please try again shortly.');
    if (!data.allowed) throw new ChatError(429, 'rate_limited', 'You have reached the conversation limit. Please try again later.', Math.max(1, Math.min(86400, Number(data.retry_after) || 60)));
  }
  return { authenticate, quota };
}

export async function providerError(response) {
  // Inspect only a known error code; never relay or log provider messages/bodies.
  const body = await response.json().catch(() => ({}));
  if (response.status === 429) {
    if (body.error?.code === 'credit_balance_exhausted') return new ChatError(503, 'provider_credits', 'Tracy is out of AI credits. The site owner needs to add API credits before voice can resume.');
    if (body.error?.type === 'insufficient_quota' || ['insufficient_quota', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'].includes(body.error?.code)) {
      return new ChatError(503, 'provider_quota', 'Tracy’s AI billing or usage limit needs attention from the site owner.');
    }
    return new ChatError(503, 'provider_busy', 'Tracy’s voice service is busy. Please try again shortly.');
  }
  if ([401, 403].includes(response.status)) return new ChatError(503, 'provider_access', 'Tracy’s AI connection needs attention from the site owner.');
  if ([400, 404].includes(response.status)) return new ChatError(503, 'provider_configuration', 'Tracy’s voice service needs setup by the site owner.');
  return new ChatError(502, 'provider_failed', 'Tracy could not connect. Please try again shortly.');
}
