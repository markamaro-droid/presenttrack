// Public deployment checks only. No environment file, real bearer token or audio needed.
const target = process.argv[2];
let site;
try { site = new URL(target); } catch { console.error('Usage: node tools/check-deployment.mjs https://your-site.vercel.app'); process.exit(1); }
if (site.protocol !== 'https:' || site.username || site.password) throw new Error('Use a public HTTPS URL without credentials.');
const offer = { action: 'start' };
for (const authenticated of [false, true]) {
  try {
    const response = await fetch(new URL('/api/coach', site), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer deliberately-invalid-test-token' } : {}) },
      body: JSON.stringify(offer), redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    const code = String(data.error || 'non_json_response').replace(/[^a-z_]/g, '').slice(0, 60);
    console.log(JSON.stringify({ check: authenticated ? 'Invalid token' : 'Missing token', status: response.status, code }));
    if (authenticated && code === 'setup_required') {
      console.log('Production setup is incomplete. Set GROQ_API_KEY, SUPABASE_URL and SUPABASE_ANON_KEY in Vercel for Production, then redeploy.');
      process.exitCode = 1;
    } else if (response.status !== 401 || code !== 'unauthorized') {
      console.log('The deployment did not pass the authentication probe. Check its function configuration and deployment logs.');
      process.exitCode = 1;
    }
  } catch {
    console.log('The deployment could not be reached. Check the URL and your network.'); process.exitCode = 1;
  }
}
