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
   This creates the requested initial admin email **markamaro1234567@gmail.com**, password **admin1234** using Supabase Auth. It refuses to reset or promote an existing account. Do not rerun it to reset a changed password. If your Supabase password policy rejects this initial password, create the account with a stronger password through your trusted server-side setup instead of weakening the policy.
4. Commit/push the changed app files and wait for the new Vercel deployment to become Ready. The SQL files in Git are **not applied by Vercel**.
5. Sign in through the usual login form using `markamaro1234567@gmail.com` and `admin1234`. The Admin Dashboard requires a new password of at least 12 characters before library management is available. You can change the admin email address there too. Keep these credentials private. Student accounts still sign in with email.

Both administrators and students sign in with their full email address. Admin access is determined by server-controlled `app_metadata`, never by matching an email address or editable `user_metadata`. If you already created the previous admin account, sign in with its full email `admin@admin.presenttrack.invalid`, then change it in the Admin Dashboard. If the requested Gmail address already belongs to an account, provisioning will stop rather than overwrite its password or role; the site owner must resolve the existing account through trusted Supabase Auth administration.

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
