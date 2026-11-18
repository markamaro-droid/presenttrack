# Private PowerPoint and PDF previews with CloudConvert

This integration uses the existing static frontend, Vercel Node API routes, Supabase Auth/Storage/Postgres, and PDF.js. It requires no Railway service, VPS, Python, Docker, or LibreOffice installation. Practice recording, timing, speech metrics, Tracy, history and progress continue through their existing routes.

## 1. Create a free CloudConvert account and API key

Use a **dedicated free account** for this application. **Verify the account email using CloudConvert's confirmation link before testing uploads.** An unverified account can have a valid API key and show remaining credits while job creation is rejected with HTTP 403. Leave paid subscriptions, credit purchases and auto-refill disabled. The integration never calls billing APIs or requests an upgrade. CloudConvert's user API does not identify whether an account's balance is free or purchased, so the app cannot enforce a free billing plan on an account that you have independently funded.

In the [CloudConvert API dashboard](https://cloudconvert.com/dashboard/api/v2/keys), create a production API key with `task.read`, `task.write` and `user.read`. Keep it private. Use the real API, not its sandbox, for student files.

As checked during implementation, the [free plan](https://cloudconvert.com/pricing) offers **10 conversion credits per day**. Office-to-PDF has a base cost of **2 credits**, with additional charges for longer conversions. This is one allowance shared by all users of the app, not ten credits per student. The code imposes a 60-second conversion-task timeout and reserves two credits before submitting each job. Expect at most five short, successful conversions per app day; provider limits or usage elsewhere on the account can reduce this. Recheck pricing before launch if CloudConvert changes its terms.

## 2. Apply the Supabase migrations

Back up your database using your usual workflow. In the same Supabase project used by `js/config.js`, open **SQL Editor** and run these files in order, after the existing assessment migrations:

1. [20261117_presentation_conversion.sql](../supabase/migrations/20261117_presentation_conversion.sql) — run only if not already applied. Creates presentation metadata, private original/preview buckets, ownership policies and the original queue functions.
2. [20261118_cloudconvert.sql](../supabase/migrations/20261118_cloudconvert.sql) — run once. Adds private cache/usage tables, consent receipts, atomic credit reservations and server-only job coordination; disables the old worker's claim/heartbeat functions.

If you use the Supabase migration CLI, deploy these through your normal migration workflow instead of rerunning them manually. These migrations are not designed to be run repeatedly.

Keep both `presentation-originals` and `presentation-previews` **private**. Do not add public read policies. The browser can insert an original only for its own registered presentation and read only its own live files. It cannot forge a preview, content hash, job ID, quota charge or completion status.

Completed previews from the previous implementation remain usable. Pending legacy PPTX uploads require the student to accept the new CloudConvert disclosure before they are submitted. This migration invalidates previous worker leases; stop any old Railway service as part of the rollout.

## 3. Add server environment variables in Vercel

Under **Project → Settings → Environment Variables**, configure the production deployment:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | URL of the same project configured in the frontend |
| `SUPABASE_ANON_KEY` | That project's anon/publishable key, used with the student's JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key for private conversion coordination |
| `CLOUDCONVERT_API_KEY` | Key from step 1 |
| `CLOUDCONVERT_WEBHOOK_SECRET` | Webhook signing secret from step 4, **not** the API key |
| `CRON_SECRET` | Random secret of at least 32 characters |

Generate a cron secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Paste it only into the server environment. Never put these private values in `js/config.js`, a `NEXT_PUBLIC_*` variable, Git, screenshots or chat.

Keep existing speech/chat environment variables. Remove the obsolete `PRESENTATION_CONVERTER_URL` and `PRESENTATION_CONVERTER_TOKEN` variables. For local development, copy the relevant placeholders from [.env.example](../.env.example) into the ignored `.env.local` file.

## 4. Configure the CloudConvert webhook

In CloudConvert's dashboard, add a webhook targeting:

```text
https://YOUR-PRODUCTION-DOMAIN/api/cloudconvert-webhook
```

Subscribe to **`job.finished`** and **`job.failed`**. Copy the webhook signing secret to Vercel's `CLOUDCONVERT_WEBHOOK_SECRET`. Redeploy after changing environment variables. The URL must be reachable by CloudConvert; a password-protected Vercel preview URL will not work without a separate authorized setup.

The endpoint verifies the `CloudConvert-Signature` HMAC against the exact raw request bytes and matches the stored attempt/job identity. It then reads job status from CloudConvert instead of trusting callback URLs or statuses. Temporary processing failures return HTTP 503 so the provider can retry. See [CloudConvert webhook documentation](https://cloudconvert.com/docs/api-reference/webhooks).

## 5. Deploy the existing application

Push the reviewed changes to your connected GitHub repository and deploy through the existing Vercel project. Keep these settings:

- Node.js **24.x**.
- Build command: `npm run build`.
- Output directory: `dist`.
- Framework preset: **Other** (the current repository uses a static frontend and Vercel API functions).

Vercel installs dependencies from `package-lock.json`. The build copies PDF.js and its supporting font/CMap/WASM assets locally. Server modules and API secrets are not part of the static output.

The checked-in `vercel.json` gives conversion routes 60-second request limits and schedules `/api/presentation-maintenance` daily at `15 0 * * *`. Vercel sends `Authorization: Bearer <CRON_SECRET>`. Ensure the production Cron Job is enabled. Hobby cron execution is approximate within its allowed window; see [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

After confirming the new flow works, remove the old Railway deployment from your Railway account. The worker source and its environment-variable dependency have been removed from this repository; deploying this code alone cannot delete an external Railway service.

## How processing and credits work

1. Authenticated students select one PDF or PPTX, up to 50 MB and 500 pages/slides. PPTX upload explicitly asks for consent to send the file to CloudConvert.
2. The browser uploads the original bytes directly to private Supabase Storage. Large files do not pass through Vercel's request-body limit. A server route verifies ownership, stored size and actual file content.
3. PDFs are validated and displayed directly from their private originals. They never contact CloudConvert or use conversion credits.
4. PPTX archives are checked for corruption, dangerous paths, excessive expansion, macros, embedded objects and externally linked assets. Ordinary hyperlinks are allowed; linked images must first be embedded in PowerPoint.
5. The server computes SHA-256 and looks for the same file under the same account. An existing completed preview is reused; simultaneous identical uploads share one queued job. Different accounts have isolated caches.
6. A database transaction reserves two credits against a shared 10-credit UTC daily budget. The server sends CloudConvert a 20-minute signed original URL and creates an Office-to-PDF job. No key is sent to the browser.
7. Webhooks, authenticated status requests and daily maintenance advance durable job state. No Vercel request waits for the whole conversion. The exported PDF is checked for validity and matching slide count, then stored privately at an immutable cache path.
8. Provider-reported task credits settle the reservation once. If a response is lost, the persisted unique job tag is reconciled before proceeding. The app never blindly repeats an uncertain POST. If the result cannot be established, it stops with an explanatory message instead of risking duplicate credits.
9. On daily-budget exhaustion or a provider quota response, the original stays saved and the next check is scheduled for the following UTC day after 00:05. Daily cron and subsequent signed-in views retry due jobs. This is the app's retry schedule; CloudConvert documents a daily allowance without guaranteeing that its reset happens at exactly this UTC time.
10. Viewing a saved preview makes no conversion request. Opening Practice repeatedly consumes no additional conversion credits. Retriable failures allow at most two explicit retries; each new conversion remains subject to the shared daily limit.

**My Presentations** shows spent/reserved app credits. The server also records the provider's reported balance and check time for diagnostics. A reported balance of zero alone is not treated as exhausted free allowance: the [user endpoint](https://cloudconvert.com/docs/api-reference/users) does not distinguish purchased balance from daily free entitlement. Use a dedicated account to keep usage accounting meaningful.

## Privacy, cleanup and fidelity

Original and preview browser download URLs expire after five minutes. CloudConvert receives only the consenting student's selected PPTX through the temporary import URL. Export downloads are HTTPS-only, restricted to CloudConvert storage hosts, do not follow redirects, and receive no API key. Originals/exports are size-bounded in memory; no temporary document files are written to the Vercel filesystem.

Once the PDF is safely saved, the provider job is deleted to remove its temporary files. Failed cleanup is retried by maintenance. Deleting a presentation hides it immediately; storage cleanup removes its original and removes a cached PDF only when no remaining presentation references it. An original still needed by a queued duplicate is retained until processing/cancellation is resolved. Abandoned uploads older than 24 hours are also collected during maintenance. Cleanup is eventual if a provider or Storage is unavailable.

The viewer renders actual PDF pages, preserving their aspect ratio, order, images and positioning. It does not rebuild slides as HTML. Text extraction is separate and is used only as practice context. PowerPoint animations/media become static, and font substitutions or unsupported effects can still change the appearance. A visible fidelity notice accompanies every converted PPTX; it is not a claim that substitutions were individually detected. Students can download the unchanged original to compare or upload a PDF exported by PowerPoint when exact font/effect fidelity is necessary.

## Verification before inviting students

From the repository root:

```powershell
npm ci
npm test
npm run test:assessment
npm run build
```

For a memory-constrained Windows machine, run the same JS suite with:

```powershell
node --liftoff-only --wasm-num-compilation-tasks=1 --test --test-concurrency=1 tests/*.test.mjs
```

For local browser fixtures, start `npm run dev` in a separate terminal, then run `node tools/check-pdf-viewer.mjs` and `node tools/check-presentation-flow.mjs`. They use simulated private storage/provider responses and locally installed Chrome; they do not spend conversion credits.

On your production setup, check these real interactions:

1. Upload a PDF. Verify its pages appear unchanged and conversion usage does not increase.
2. Upload a small PPTX after accepting the CloudConvert disclosure. Verify queued → processing → completed, a valid webhook response, and a private saved PDF.
3. Refresh/open Practice again, then upload the same PPTX under the same account. Verify no second CloudConvert job is created.
4. Compare fonts, logos, diagrams, slide order and aspect ratio with the original, including your school template. Check portrait slides and mobile fullscreen.
5. Sign in as another student and verify the first student's presentation cannot be accessed. Do not make buckets public to resolve an access error.
6. Verify deletion, practice Start/Pause/Finish, retained-audio retry, WPM/filler/pause results and history. In Vercel logs, confirm maintenance is authorized and webhook errors resolve.

Automated tests cover database ownership/quotas/leases/cache retirement, input validation, API authentication, signed webhooks, lost job responses, provider quota responses, PDF caching and browser rendering. Live Supabase/CloudConvert credentials and your exact presentation files are still required for the final production check.

Common setup errors: `converter_setup_required` means missing server variables; `storage_credentials_rejected` means Supabase rejected the backend credential; `storage_permissions` means the backend key/role lacks access; `storage_schema_missing` means the selected project is missing a required table, column or function in its API schema; `storage_bucket_missing` means a private bucket is missing; `storage_unavailable` is a transient or otherwise unclassified storage failure. Webhook 401 means the signing secret does not match; `provider_rejected` usually requires checking key scopes/configuration. `submission_uncertain` requires checking the CloudConvert dashboard by job tag or using a PowerPoint PDF export; it is intentionally not retried automatically.

If PowerPoint upload reports a storage error even though both migrations exist, check Vercel's **Production** value for `SUPABASE_SERVICE_ROLE_KEY` against the service-role key of the same project as `SUPABASE_URL`. Keep the value private, without quotation marks or an added `Bearer ` prefix. Save and redeploy; editing an environment variable does not update an existing deployment. A valid key in your local `.env.local` does not prove the Vercel deployment has the same key.

After deploying the updated code, Vercel runtime logs include `presentation_storage_error` with only the operation, HTTP status and a bounded database error code. These diagnostics omit keys, response messages, query values and private file/user data. Use that entry to identify the failing request instead of rerunning migrations that are already applied.

`cloudconvert_email_unverified` means the CloudConvert account must confirm its email. Sign in to CloudConvert, resend its confirmation email if needed, and follow the verification link. Then use **Retry preview** on the saved presentation; no re-upload or database migration is required. A rejected job spends no conversion credits. `cloudconvert_credentials` identifies a rejected API key, and `cloudconvert_permissions` identifies another account/permission restriction. The server logs `cloudconvert_job_rejected` with only a status and safe reason code, never the raw provider response or credentials.
