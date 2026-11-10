# Tracy chat and voice setup

Tracy supports text and voice conversations through the authenticated `/api/coach` backend (Groq, with optional Gemini fallback).

Each question includes fresh read-only application context from `js/tracy-context.js`: the displayed account name, current page, workspace totals, presentation titles, goals, notifications, selected slide text, and available performance results. Tracy can explain these records and the system's features. She cannot modify records or open arbitrary files. Credentials, email addresses, profile images and file URLs are excluded.

Previously the snapshot omitted the displayed name, which caused responses saying she could not see it. The snapshot and backend instructions now include it. During account loading or on the welcome screen, only the available name and page are shared; workspace data is included after it loads.

After changing this integration, run `npm test` and `npm run build`, then deploy both the frontend and backend together to update a hosted app. Refresh the app and ask “What is my name?”, “Which page am I on?”, or “What can I do here?” Local code changes do not update an already hosted deployment. Clear conversation if you want to remove old replies; current context takes priority over earlier statements that information was unavailable.

See [TRACY_VOICE_SETUP.md](TRACY_VOICE_SETUP.md) for current architecture, configuration, diagnosis, testing, and GitHub/Vercel instructions.

The new authenticated quota function does not require a Supabase service-role key.

Evaluation now checks recorded audio and slide-content coverage before awarding a baseline. It requires Groq and Gemini keys plus the new recorded-evaluation SQL migration. See [evaluation setup and verification](docs/EVALUATION.md). Tracy treats older browser-only evaluation results as needing a retake.
