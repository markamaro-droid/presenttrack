# Connected learning system

This extends the existing static JavaScript application and Vercel Node API routes.
It does not replace the UI with React or Next.js. CloudConvert conversion, private
originals, cached PDF previews and PDF.js rendering continue unchanged.

## Deploy to the existing project

1. Ensure the existing recorded-evaluation and CloudConvert migrations are already
   applied. Use the same Supabase project as `js/config.js` and the Vercel variables.
2. Open Supabase **SQL Editor → New query**. Copy the entire contents of
   [`20261119_learning_system.sql`](../supabase/migrations/20261119_learning_system.sql),
   including `begin` and `commit`, then click **Run**. This migration was tested
   twice against a fresh PostgreSQL-compatible test database to verify reruns.
   It creates new tables, indexes, owner policies and server-only functions; it
   retains existing presentations and workspace JSON. It also retires the old
   browser-submitted evaluation RPC, so deploy the matching application promptly.
3. Confirm these tables appear in Supabase Table Editor:
   `learning_sessions`, `learning_deletions`, `presentation_understanding`,
   `learning_preferences`, `tracy_conversations`, `tracy_memories`.
   Do not disable RLS or make presentation buckets public.
4. In **Vercel → project → Settings → Environment Variables**, keep the existing
   configuration and confirm the server variables below. `.env.local` is only
   for your local machine; it does not configure Vercel.

   | Variable | Purpose |
   | --- | --- |
   | `SUPABASE_URL` | Your existing project URL |
   | `SUPABASE_ANON_KEY` | Verify the signed-in user's JWT |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only ownership-scoped persistence |
   | `GROQ_API_KEY` | Transcription, content understanding, semantic feedback, Tracy |
   | `GROQ_LEARNING_MODEL` | Optional; defaults to `openai/gpt-oss-20b`, with strict JSON Schema support |
   | `GEMINI_API_KEY` | Required second audio pass for baseline filler detection |
   | `GEMINI_VERBATIM_MODEL` | Optional; existing model configuration still applies |
   | `CRON_SECRET` | Existing daily maintenance authentication |

   Keep all existing CloudConvert, webhook and voice variables. Never add public
   prefixes to secret variables, put keys in `js/config.js`, or commit `.env.local`.
5. Review and commit all implementation files, including the new `server/`, `js/`,
   `css/`, `api/learning.js`, migration, documentation and tests. Push to the branch
   linked to your Vercel project. Build settings remain **Other**, **Node 24.x**,
   **`npm run build`**, output **`dist`**. The new API route uses the existing deployment.
6. Wait for the deployment to show **Ready**, then refresh the website. Verify the
   existing `/api/presentation-maintenance` daily cron remains enabled. It now also
   purges expired Tracy conversations; it does not delete performance history.
7. Test a new account through a 90-second-or-longer evaluation. Complete both
   analysis stages, check the dashboard opens, then sign out and back in. Returning
   users with the completed flag go directly to the dashboard. A reassessment must
   create a separate history entry while retaining the original baseline.
8. Upload a small PDF or PPTX, consent to processing, and start practice. Content
   preparation may take several bounded requests before recording starts. Navigate
   between slides while speaking, then Finish. Check the two report sections,
   baseline/previous comparisons and the saved history after refreshing.
9. In **Settings → Tracy memory and privacy**, test optional conversation history,
   retention, and one approved memory. Correct/delete that memory and turn history
   off. Performance records must remain. Test account deletion only with a disposable
   account: it is permanent and requires the current password and typing `DELETE`.

Do not deploy old frontend code after applying this migration: its old evaluation
save RPC is intentionally disabled. A failure to apply the migration produces a
visible learning-history setup error; no fake scores or replacement records are generated.

## Persistence and ownership

Every API call authenticates through Supabase Auth. Client-supplied account IDs
are ignored. Service-role queries explicitly filter the authenticated owner; the
service key is never sent to the browser. New tables enable RLS with owner-only
reads and no direct authenticated writes. Server-only RPCs perform validated writes.

`learning_sessions` is the canonical completed report store. It contains delivery
measurements, transcript, timestamped words, slide navigation alignment, explanation
feedback, rubric versions and original timestamps. A stable request UUID prevents
duplicate completed records; retrying a completed request returns its stored result.
Parallel retries may still consume provider requests before the atomic save.

A partial unique index permits one baseline per account. The save RPC serializes
baseline/reassessment decisions and updates the completion flag atomically. A
workspace trigger prevents ordinary autosaves from replacing that baseline.
Reassessments remain separate. Incomplete/failed evaluations do not complete the gate.

The migration imports existing recorded baselines and analyzed practice JSON without
deleting the original JSON. Imported practice dates use the original timestamp when
available; unknown original dates remain unknown in the UI. The import timestamp is
not represented as the original practice date. If an older application already
overwrote an original baseline, this migration cannot recover it: it protects the
recorded baseline that remains. Historical qualitative scores are not invented.

Deleting a practice result removes its transcript/report and workspace reference.
`learning_deletions` retains only owner/session/legacy identifiers so stale browser
autosaves cannot restore deleted content. The original baseline remains until account
deletion. Account deletion verifies the current password, removes the user's known
private storage prefixes, then deletes Auth and associated database records.

## Presentation understanding and recording

PPTX validation rejects unsafe archives, macros, linked assets and oversized content.
Extraction follows presentation relationship order and includes slide text, available
speaker notes and embedded chart/diagram text. PDF extraction reads the original PDF
with PDF.js. Neither path reconstructs the visual slides.

Understanding is cached per immutable presentation ID. Four slides are analyzed per
request. A 90-second lease prevents overlapping preparation requests; pending batches
resume from the last saved batch. Each AI request has a 30-second timeout. Server
quotas allow at most 10 preparation batches/minute and 200/day per account. Provider
limits may be lower: a failed batch shows an error and can be retried without repeating
completed batches. There is no external daemon or automatic paid upgrade.

Objectives are labeled `stated` or `inferred`. Extraction truncates unusually long
slide text to 6,000 characters, notes to 3,000 and each linked chart to 2,000. Scanned
pages/images receive no OCR or invented visual interpretation. An entirely image-only
document cannot receive a reliable content assessment and shows a visible error.

Live practice stores slide changes against the active recording clock, excluding
paused recording time. Timestamped transcription words map to the displayed slide,
including revisits. Uploaded recordings have no navigation log and explicitly lack
that alignment. Explanation analysis still uses their transcript and saved content.
Audio and presentation processing require the existing consent controls. Temporary
recordings are deleted after processing; an interrupted cleanup can leave a temporary copy.

## Separate scoring rubrics

**Delivery v2** uses three equally weighted dimensions, each 0–2 points, then
`sum / 6 × 100`. Pace receives 2 points at 100–160 WPM, 1 at 90–180 outside that
range, otherwise 0. Filler frequency receives 2 points at at most 3/minute, 1 at
at most 6/minute, otherwise 0. The existing detector uses the span of recognized
speech for this filler score; reports additionally show fillers per 100 words for
cross-session comparisons. Duration receives 2 points in the target range and 1
in the wider acceptable range. The baseline target is 120–180 seconds with an
acceptable 90–210 seconds; practice uses 90–110% and 75–125% of the chosen target.
Faster speech or a longer talk does not automatically score higher.

Pauses are observations and do not deduct delivery-v2 points. Users choose a
1–5-second threshold in Settings. Timing cannot establish whether a pause was
intentional. Older rubric scores remain unchanged and retain their version.

**Explanation v1** assesses objectives, coverage, clarity, topic relevance, example
relevance, accuracy relative to slides, and organization independently of delivery.

| Score | Meaning |
| --- | --- |
| 0 | No relevant explanation, or a supported contradiction |
| 1 | Limited or mostly undeveloped |
| 2 | Partial, with important gaps |
| 3 | Clear and mostly complete |
| 4 | Well developed, coherent and supported |
| Unassessed | Not applicable or insufficient evidence |

The explanation percentage is the mean of assessed criteria divided by 4, with
at least four assessed criteria required. Scores above zero require transcript
evidence. All returned quotes must occur in the actual transcript and referenced
slides must exist. Invalid evidence rejects the explanation result. Paraphrases and
creative analogies are explicitly allowed. Corrections are suggestions, never invented
student statements. Accuracy is relative to supplied slides, not independent fact checking.
No combined score or objective confidence measure is produced.

Provider outputs use [Groq strict structured outputs](https://console.groq.com/docs/structured-outputs)
and server-side Zod validation. Strict shape validation does not make subjective
judgments objectively correct; students can inspect the transcript and evidence.
If explanation analysis fails during ordinary practice, delivery is saved and the
report offers Retry explanation analysis. Manual review is capped at 10/minute,
20/day per account. A baseline requires successful explanation and both audio passes.

## Comparisons and coaching

Reports show changes from the original baseline and the previous dated session,
including normalized fillers/100 words and pauses/recording minute. Cross-topic
explanation comparisons are approximate because difficulty, objectives and evidence
change. Delivery scores from different historical rubric versions also need context.
Word counts and durations are descriptive, not improvement targets by themselves.

Progress respects presentation/date filters and supports all, last five or last ten
sessions. It contains only actual analyzed account records. Charts show averages,
last-five averages and metric-appropriate personal bests. Trends require at least
three observations; pace compares distance from the reference range, not speed.
Pauses, words and duration remain context dependent. Unknown measurements are not zero.

Report goals can be adopted into the existing account-saved Goals page. A goal tracks
the selected explanation criterion on later practices, optionally scoped to the same
presentation. Existing attempts do not prematurely complete a newly adopted goal.
Goals remain editable and deletable. Existing delivery goals and notifications remain.

Tracy retrieves the authenticated account's baseline, five recent compact performance
summaries, up to eight relevant approved memories, and up to three relevant past
conversations selected from the latest forty retained turns. For a selected saved
presentation it retrieves up to six relevant analyzed slides, with the total slide
count disclosed to the model. It does not send historical raw transcripts or complete
conversation history with every request. Uploaded content and memories are treated
as untrusted evidence, not system instructions.

Conversation history is off by default. Enabling it retains turns for 30, 90 or 365
days. Turning it off deletes saved conversations, while keeping performance and
explicitly approved memories. Preference writes and conversation saves serialize in
the database so an in-flight reply cannot revive disabled history. Reducing retention
shortens existing expiry from the original creation date; it never extends older turns.
Memories require explicit approval and are capped at fifty, each at most 500 characters.

## Verification

Run locally:

```powershell
npm run build
node --liftoff-only --wasm-num-compilation-tasks=1 --test --test-concurrency=1 tests/*.test.mjs
npm run test:assessment
node tools/check-learning-browser.mjs
```

The memory-saving and deletion tests use isolated test data, not real student accounts.
Browser checks cover desktop and mobile with mocked APIs. Database tests exercise
real SQL/RLS through PGlite, including cross-account access, atomic baselines,
idempotency, disabled conversation consent, deletion and stale autosave protection.
API tests exercise owned storage access, preserved delivery after provider failures,
bounded coaching retrieval and password verification before account deletion.

Optional live AI smoke checks use only synthetic text and consume provider tokens:

```powershell
node --env-file=.env.local tools/check-learning-ai.mjs paraphrase
# Wait for any provider rate-limit window before the second check.
node --env-file=.env.local tools/check-learning-ai.mjs "unrelated example"
```

Live checks during implementation recognized the accurate paraphrase, scored the
unconnected cooking example lower, and extracted labeled objectives from the bundled
sample presentation. These checks do not substitute for testing a microphone recording
through the deployed app after the live migration. No real student's account was deleted.
