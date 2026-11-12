# Library and admin setup

The app now includes Library in the student sidebar, three original five-slide decks, editable PPTX downloads, and matching PDF previews. Students complete Evaluation once, then select **Library → View presentation → Use for practice**. This saves their own copy in My Presentations, with slide text available for feedback. Published library originals remain unchanged. Admins can add a PPTX or PDF as a draft, edit its details, and publish or hide it. Hiding removes a deck from the catalog and blocks access to custom uploads; students keep copies they already saved. Built-in assets are public files and remain accessible by direct URL.

## Before testing on the live site

1. In **Supabase → SQL Editor**, run these files in this order:
   - `supabase/migrations/20261110_presentation_library.sql`
   - `supabase/migrations/20261110_presentation_library_seed.sql`
   - `supabase/migrations/20261110_practice_quota.sql`
   The quota migration requires the existing `20261106_tracy_voice.sql`. These migrations retain existing accounts and reports. The seed does not overwrite later admin edits.
2. Add `SUPABASE_SERVICE_ROLE_KEY` to **Vercel → presenttrack → Settings → Environment Variables**, for the server only. `SUPABASE_URL` and `SUPABASE_ANON_KEY` must also be configured. Never put the service-role key in `js/config.js`, browser code, screenshots or chat.
3. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your local, git-ignored `.env.local`. From the project terminal run once:
   ```powershell
   node --env-file=.env.local tools/create-admin.mjs
   ```
   This creates the requested initial admin email **markamaro1234567@gmail.com**, password **admin1234** using Supabase Auth. If the email already belongs to a regular account, the script explains that you must explicitly adopt it with the command below. Re-running setup for an existing admin leaves its password unchanged. If your Supabase password policy rejects this initial password, create the account with a stronger password through your trusted server-side setup instead of weakening the policy.
   To turn the existing account for this exact email into the initial admin, preserving its account ID, profile, presentations and reports, run:
   ```powershell
   node --env-file=.env.local tools/create-admin.mjs --adopt-existing
   ```
   This explicitly gives that account the admin role and sets `admin1234` as its initial password. It requires a password change at first admin login. It does not reset an account that is already an admin.
4. Commit/push the changed app files and wait for the new Vercel deployment to become Ready. The SQL files in Git are **not applied by Vercel**.
5. Sign in through the usual login form using `markamaro1234567@gmail.com` and `admin1234`. The Admin Dashboard requires a new password of at least 12 characters before library management is available. You can change the admin email address there too. Keep these credentials private. Student accounts still sign in with email.

Both administrators and students sign in with their full email address. Admin access is determined by server-controlled `app_metadata`, never by matching an email address or editable `user_metadata`. If you already created the previous admin account, sign in with its full email `admin@admin.presenttrack.invalid`, then change it in the Admin Dashboard. If the requested Gmail address already belongs to a regular account, the site owner can use `--adopt-existing` locally with the service-role key. Ordinary setup never silently changes an existing account. The tool reports safe HTTP/error codes for key, password-policy and database failures; raw provider errors and keys are not printed.

The browser checks which navigation to display; database row-level security independently checks the actual account's admin role and initial-password flag for all catalog and storage writes. Existing private student data stays private. No public bootstrap endpoint is provided.

Supabase reference: [server-side account creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [admin credential updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Recording retry fix

Practice and Evaluation analysis previously consumed Tracy voice slots, causing the misleading conversation-limit error. They now share an independent recording-analysis budget of 3 attempts/minute, 20/hour and 60/day per account. The slot covers transcription and optional slide comments. Failed attempts still consume a slot. Tracy keeps its own limits.

Analysis errors remain visible beside the slides and provide a **Retry analysis** action using the retained recording. Keep the current page open to retain unsaved audio. After the migration and backend deployment, an already-open older page can retry with **Finish**. Refreshing or leaving the page loses that in-memory recording.

## Verification

- `npm test`
- `npm run test:assessment`
- `npm run build`
- With `npm run dev` running: `node tools/check-presentation-flow.mjs`
- Optional staging-only database checks: `supabase/tests/library-access.sql` and `supabase/tests/practice-quota.sql`; both roll back their test data.

Regenerate the original PPTX/PDF assets and seed with `python tools/build-library.py`. Live authentication, RLS and storage must also be verified against your configured Supabase project after setup; local mocks do not prove that a migration has been applied.

## System monitoring update

Apply `supabase/migrations/20261111_admin_monitoring.sql` once in the Supabase SQL Editor, then push/deploy the updated application. No account recreation is needed. The existing server-only `SUPABASE_SERVICE_ROLE_KEY` is required in Vercel.

- **Admin Dashboard:** total users, student/admin counts, new registrations and recent sign-ins, evaluation completion, saved presentations and recorded-audio practice reports; published/draft library counts; seven-day registration chart and 24-hour quota usage. Configuration checks report key presence, not provider uptime or credits.
- **Users:** search by name/email, filter by role or evaluation completion, and browse 25 accounts per page. Shows registration/sign-in dates, email confirmation/suspension status and presentation/report counts. No transcripts or private presentation content are returned.
- **Library:** secured administrators can add, edit, publish/hide and preview decks here. Before changing the initial password, the same sidebar link opens the published library for browsing and explains how to unlock publishing. It no longer silently redirects back to the dashboard.
- **Account settings:** expand Admin account settings in the overview to change credentials. Password setup remains required for monitoring and library writes.

Metrics count registered, non-anonymous accounts. Recent sign-in is not a live online count; saved presentations include library copies; practice counts exclude evaluation and demo/legacy entries. AI usage counts attempts accepted by the quota, including later failures. Dates on the registration chart use UTC. Refresh the overview to fetch current data. Figures come from stored workspace state and are operational indicators, not tamper-proof audit records.

The database monitoring function grants execution only to the server service role. `/api/admin` verifies the signed-in caller's current server-controlled admin role and password-change flag before invoking it. Existing student RLS policies stay in force. If the migration is missing, the UI gives the exact setup filename instead of displaying zero counts.

Local SQL verification uses an isolated temporary PostgreSQL engine and never connects to Supabase:

```powershell
$sqlTestDir = Join-Path $env:TEMP 'presenttrack-admin-sql-check'
npm install --prefix $sqlTestDir --no-save --ignore-scripts --no-audit --no-fund @electric-sql/pglite
node --liftoff-only --no-wasm-tier-up --wasm-lazy-compilation --wasm-num-compilation-tasks=1 tools/check-admin-monitoring-sql.mjs
```

This check executes the migration against mock tables and verifies totals, search, pagination, malformed legacy state, private-field exclusion and function permissions. It does not verify that the live project has applied the migration.
