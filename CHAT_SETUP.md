# PresentTrack robot AI chat

The existing app is plain HTML/CSS/JavaScript, with Three.js for the robot and Supabase Auth. The assessment backend already uses OpenAI; this integration uses the same provider and default `gpt-4o-mini` model through its supported HTTPS Chat Completions API. No runtime packages are required. The model is configurable on the server.

## Files and behavior

| Files | Purpose |
| --- | --- |
| `api/chat.js`, `server/chat.mjs` | Vercel POST endpoint, validation, verified Supabase identity, usage checks, coach instructions, and OpenAI request |
| `js/robot-chat.js`, `css/robot-chat.css`, `index.html` | Compact panel in the existing robot, typing status, safe text rendering, automatic scrolling, retries, and recent conversation context |
| `js/robot.js` | Connects existing microphone input and animation states to the same chat; preserves local tour/navigation commands |
| `supabase/migrations/20261106_robot_chat_rate_limit.sql` | Atomic quota function using the existing `ai_usage` table; callable only by the server service role |
| `tools/dev.mjs`, `tools/build.mjs`, `package.json`, `package-lock.json`, `vercel.json` | Local server and explicit public-asset build for Vercel |
| `.gitignore`, `.env.example` | Keep secrets out of Git and document environment configuration |
| `tests/*.test.mjs` | Endpoint, chat lifecycle and local HTTP tests with mocked external services |

`assets/models/robot.glb` and `assets/models/robot-glb.js` are unchanged. The robot's model, rendering, animation loop and placement remain intact. There was no working text chat panel to reuse: the old panel functions were empty. Tap the robot, choose **Chat**, and type; hold-to-talk still works in supported browsers. Microphone fallback now opens the text panel.

## 1. Local setup

1. Install Node.js 24, then open PowerShell in the repository root.
2. Run `npm install` (there are no runtime dependencies).
3. Copy the template if `.env.local` does not already exist:

   ```powershell
   if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
   ```

4. Edit `.env.local` locally:

   ```dotenv
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_MODEL=gpt-4o-mini
   SUPABASE_URL=https://your-existing-project.supabase.co
   SUPABASE_ANON_KEY=your-existing-publishable-or-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   ```

   Match the Supabase URL and publishable/anon key in `js/config.js`. Get the server-only legacy `service_role` key from the same project's API settings. It is used only for the quota function. Do not put it or the OpenAI key in `js/config.js`, HTML, screenshots, or Git. Do not add a public/client prefix to these secrets. Existing Supabase Edge Function secrets are **not** automatically available to Vercel.

5. In Supabase SQL Editor, run **only** `supabase/migrations/20261106_robot_chat_rate_limit.sql`. It requires the existing `ai_usage` table from the initial assessment migration. It creates a function and grants, without changing existing tables or adding chat-history storage. If your database lacks `ai_usage`, review/apply the existing assessment setup first; do not blindly rerun unrelated migrations against production.
6. Run `npm run dev`, open **http://localhost:3000**, and sign in with a real Supabase account. Restart the server after changing `.env.local`. Opening `index.html` directly or using a static-only server cannot run `/api/chat`; demo accounts cannot call AI.

The implemented limits are 5 requests/minute, 30/hour and 100/day **per verified user**, shared across tabs and Vercel instances. A PostgreSQL transaction advisory lock makes the count and insert atomic. Accepted attempts count even if the provider subsequently fails. Missing configuration or quota-service errors fail closed. There is no in-memory rate-limit fallback.

Messages are limited to 2,000 characters; the provider gets at most the latest six completed exchanges, within a 16,000-character total input budget, plus fixed coach instructions. Replies are capped at 600 completion tokens and 6,000 characters. No automatic provider retries are performed. The client blocks overlapping requests in the same tab; cross-tab requests share the database quota. The provider call times out after 30 seconds; the browser waits up to 50 seconds. Cancelling in the browser prevents stale replies from appearing, but a request already accepted by the server can still consume quota and provider usage.

## 2. Local checks

```powershell
npm test
npm run test:assessment
npm run build
```

With `npm run dev` running, this request should return HTTP **401**, without calling OpenAI:

```powershell
curl.exe -i -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" --data-raw '{"message":"Help me prepare"}'
```

Use the signed-in robot for authenticated testing; do not paste access tokens into shared terminals or documentation. In browser developer tools, confirm that chat requests go to `/api/chat`. The browser sends only `{message, history}` and its Supabase access token. The API response contains only `{reply}` or a sanitized error; neither server secret is included.

Manual acceptance checklist after configuration:

1. Send “Help me prepare a three-minute thesis introduction,” then “Make that more concise.” Confirm a real response and continuity.
2. Confirm typing status, disabled Send, automatic scrolling, Enter submission, New chat, and Escape/Close behavior.
3. Toggle the browser offline, send a message, then reconnect and retry. The text should remain available and failed turns should not enter context.
4. Send six quick requests, allowing each to finish, to exercise the minute quota. Confirm HTTP 429 and a wait message. For database concurrency verification, issue simultaneous requests under the same test account and confirm at most five slots are accepted per rolling minute. Hour/day limits require a dedicated test account or database test fixture.
5. Start a reply, then sign out. Sign in as another account and confirm no old transcript or delayed response appears. Refreshing the page also clears the conversation.
6. Test narrow mobile screens, landscape, the onscreen keyboard, light/dark themes, keyboard focus, and screen-reader announcements.
7. Test hold-to-talk, muted voice, robot eye tracking, animation states, guided tour, minimize/restore, and microphone-denied fallback.
8. Smoke-test uploads, Practice, reports and browser evaluation. Their existing runtime modules are included in the static build.

## 3. GitHub and Vercel

1. Review `git diff` and `git status`. Check `git check-ignore .env.local`: it must print `.env.local`.
2. Commit the integration with explicit paths (do not add `.env.local`):

   ```powershell
   git add .gitignore .env.example package.json package-lock.json vercel.json CHAT_SETUP.md index.html api server js/robot.js js/robot-chat.js css/robot-chat.css tools/dev.mjs tools/build.mjs tests supabase/migrations/20261106_robot_chat_rate_limit.sql
   git commit -m "Integrate secure AI chat with PresentTrack robot"
   ```

3. In the existing Vercel project's **Settings → Environment Variables**, add `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Select Production and any Preview/Development environments you intend to use. Configure these before the deployment you will test. This repository does not contain your secret values.
4. Keep the Vercel root directory pointed at this repository. Use framework preset **Other**, Node.js **24.x**, build command **`npm run build`**, and output directory **`dist`**, as declared in `vercel.json`. `api/chat.js` is a Vercel Node function. Do not add a catch-all rewrite that sends `/api/chat` to `index.html`.
5. Push your current branch with `git push` (or `git push -u origin HEAD` for a new branch). Your existing GitHub integration should start the corresponding Vercel deployment; merge through your normal process for the configured production branch.
6. Open the deployment in Vercel. Confirm the build succeeds, the `/api/chat` function exists, and the deployment becomes Ready. An unauthenticated POST should return 401; a signed-in robot message should return 200 and an AI reply.
7. Run the manual checklist on the deployed URL. If you change environment variables after a deployment, redeploy for them to take effect. A 503 can indicate missing configuration, an unapplied quota migration, or an unavailable upstream service; detailed provider errors are intentionally not returned to the browser.

The static build copies only the site's public directories and six browser evaluation modules. It excludes `.env*`, server code, SQL, tests and repository metadata. Do not change the output directory to the repository root.

## Privacy and validation status

Chat text is kept only in the current tab's memory. No chat database/table, localStorage history, conversation ID lookup, or cross-user transcript endpoint is introduced. New chat, page reload, sign-out and account changes clear it. The endpoint never queries student records and never sends `podium.ctx()`, profile information, uploaded decks or performance history to OpenAI. The model sees the user-entered conversation, including any results the user chooses to type. `store: false` disables Chat Completion storage; it does not override the provider's separate retention policies.

Automated checks cover mocked AI replies, multi-turn payloads, authentication failures, input validation, quota denial/failure, upstream failures, sanitized errors, duplicate sends, typing/error states, plain-text rendering, scrolling, clearing and cancellation, stale replies after sign-out, context bounds, preserved local commands, local HTTP routes and public-file restrictions. Existing classification, feedback, metrics and quality tests also run. These are not live OpenAI/Supabase tests or browser layout tests. Actual provider access, SQL execution/concurrency, Vercel deployment, mobile layout, speech/WebGL behavior and the full application workflow still require the manual checks above. The existing deck-generation suite requires additional tooling and is not part of this change's test command.

API references: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat), [Supabase authenticated user retrieval](https://supabase.com/docs/reference/javascript/auth-getuser), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).
