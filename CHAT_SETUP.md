# Tracy chat and voice setup

Tracy supports text and voice conversations through the authenticated `/api/coach` backend (Groq, with optional Gemini fallback).

Each question includes fresh read-only application context from `js/tracy-context.js`: the displayed account name, current page, workspace totals, presentation titles, goals, notifications, selected slide text, and available performance results. Tracy can explain these records and the system's features. She cannot modify records or open arbitrary files. Credentials, email addresses, profile images and file URLs are excluded.

Previously the snapshot omitted the displayed name, which caused responses saying she could not see it. The snapshot and backend instructions now include it. During account loading or on the welcome screen, only the available name and page are shared; workspace data is included after it loads.

After changing this integration, run `npm test` and `npm run build`, then deploy both the frontend and backend together to update a hosted app. Refresh the app and ask “What is my name?”, “Which page am I on?”, or “What can I do here?” Local code changes do not update an already hosted deployment. Clear conversation if you want to remove old replies; current context takes priority over earlier statements that information was unavailable.

See [TRACY_VOICE_SETUP.md](TRACY_VOICE_SETUP.md) for current architecture, configuration, diagnosis, testing, and GitHub/Vercel instructions.

The new authenticated quota function does not require a Supabase service-role key.

Evaluation now checks recorded audio and slide-content coverage before awarding a baseline. It requires Groq and Gemini keys plus the new recorded-evaluation SQL migration. See [evaluation setup and verification](docs/EVALUATION.md). Tracy treats older browser-only evaluation results as needing a retake.

On November 10, 2026, a read-only check of `https://presenttrack-nu.vercel.app` found the older evaluation script (without the recorded-evaluation path) and older generic filler feedback. Local changes alone do not update that deployment. Deploy the current frontend and backend together, apply the recorded-evaluation migration if not yet applied, and verify the public report assets with:

```powershell
node tools/check-evaluation-deployment.mjs https://presenttrack-nu.vercel.app
```

`OUTDATED` or `UNAVAILABLE` means the hosted report code does not match this checkout. The check does not sign in, send audio, verify private backend configuration, or apply migrations.

If saving fails immediately after applying `20261110_recorded_evaluation.sql`, check the deployment first. The migration intentionally revokes `complete_browser_evaluation`; an old frontend still calling it cannot save. The public site was confirmed to be calling that old RPC on November 10. Deploy the latest project revision (not just a redeployment of the old revision), then refresh and retake. An old browser-only recording cannot be converted into a recorded-audio evaluation. Do not re-enable the obsolete RPC to bypass the new checks.

Evaluation topic coverage is now advisory: usable speech proceeds to results, with topic relevance in feedback. Counting-only or insufficient speech still fails. Deploy the updated frontend and backend together; no additional SQL migration is required for this change.

## Library and administrator setup

See [Library and Admin setup](docs/LIBRARY_ADMIN_SETUP.md) for the three SQL migrations, one-time administrator provisioning, server environment variable, deployment steps and independent recording-analysis quota. The initial admin account is not created merely by deploying frontend files.
