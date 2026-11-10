# Built-in recorded evaluation

Evaluation records the five-slide study-habits talk in
`assets/evaluation/study-habits.js`. The server imports the same deck as the page;
client-supplied presentation text cannot replace the evaluation reference.
The deck requires no upload and does not consume the presentation upload quota.

After explicit audio-processing consent, the browser records with MediaRecorder.
`/api/practice` authenticates the user and transcribes the audio with Groq Whisper
word timestamps. A separate Gemini audio pass preserves audible hesitations for
filler counting. Both passes must succeed for an evaluation. Missing or failed
filler analysis produces a retry message, never an assumed zero count.

Aim for 2–3 minutes. The browser requires at least 90 seconds and finishes at five
minutes; the server allows two extra seconds for codec padding. Before scoring,
both transcripts must contain enough meaningful speech. Number drills, excessive
repetition, fewer than 120 tokens and insufficient distinct vocabulary still fail.
Topic coverage is advisory for Evaluation: usable speech proceeds to delivery
results even when it is unrelated or covers only part of the slides. Feedback
explains limited topic overlap and suggests what to cover next; it does not change
the delivery score. Related-topic feedback is also shown in the measurement details.
The reference check uses 50% vocabulary coverage, 25% topic precision and coverage
of at least three sections as coaching thresholds, not semantic grading. Paraphrases
and transcription errors can affect this advice; passing does not prove accuracy.
The existing recorded-evaluation SQL accepts these usable results without a new
migration: `eligible` describes speech eligibility, and `topicStatus` stores the
separate advisory finding. Deploy frontend and backend together.

Pace uses recognized words divided by recorded duration, including pauses. Long
pauses are gaps of at least two seconds between timestamped words. Overlapping
word timestamps do not create extra gaps; leading and trailing silence are excluded.
Fillers use the independent verbatim transcript (Gemini, temperature 0 to reduce
variation; identical results are not guaranteed). For each exact filler spelling,
the count is topped up when the timestamped Whisper transcript detected more.
Different spellings across transcripts can still overcount the same hesitation.
Feedback and score labels use the measured counts, so "0 detected" is reported as
"No fillers detected", never "Few fillers". Verbatim-only detections have no
timeline positions; additional Whisper detections retain their audio timestamps.
Counts remain recognition estimates: zero
detected does not prove no fillers occurred.

Only a successful `complete_recorded_evaluation(p_results)` save updates the local
baseline and completion flag. A failed analysis retains audio in memory for retry;
a rejected recording requires a retake. A failed save retains the analyzed result
for Retry saving. Leaving the page or changing accounts cancels work and releases
the microphone. Large recordings use the existing private temporary audio bucket;
the endpoint attempts cleanup after processing. Provider retention follows each
provider's settings. Transcripts and results are saved to the account.

Old browser-only evaluation scores and filler/pause counts are marked as needing
a retake in reports, dashboard comparisons, exports, and Tracy's context. Historical
records and account access flags are retained; old audio cannot be re-analyzed.

## Deployment

1. Configure server-only `GROQ_API_KEY` and `GEMINI_API_KEY`. Optional overrides are
   `GROQ_TRANSCRIPTION_MODEL` and `GEMINI_VERBATIM_MODEL` (see `.env.example`).
2. Apply `supabase/migrations/20261110_recorded_evaluation.sql` after
   `20261030_evaluation_gate.sql`. It creates the new authenticated save RPC and
   revokes the obsolete browser-only RPC. It preserves existing account data and
   upload quotas. The RPC checks the result envelope; it does not independently
   transcribe audio or provide tamper-proof attestation of client submissions.
3. Deploy the frontend and `/api/practice` backend together, then retake Evaluation.

The migration has not been applied to a live database from this workspace.

## Report consistency

Report cards and delivery feedback now read the same saved `metrics` object.
`supabase/functions/_shared/report.js` refreshes delivery wording when a report
opens, without changing the saved score, account data, or audio measurements.
Practice report cards ignore stale duplicated session counts. Evaluation cards
list detected filler words and frequencies, including untimed verbatim detections.
Missing word details remain unavailable; conflicting saved details request a retake.
Generic filler examples are no longer presented as if those exact words were heard.
AI slide comments are kept separate from measured delivery feedback, with English
delivery claims filtered out; this filter is not a multilingual semantic validator.

Run `node tools/check-evaluation-deployment.mjs https://presenttrack-nu.vercel.app`
after deployment to compare public report assets with this checkout. This does not
verify private backend code, database state, or recognition accuracy.

## Verification

Run `npm test`, `npm run test:assessment`, and `npm run build`. Tests cover invalid
numeric/repeated/off-topic recordings, short clips, mandatory verbatim failures,
timestamp gaps, missing measurements, navigation/account changes, and analysis/save
retries. Browser layout checks use `node tools/check-companion-ui.mjs` with the local
dev server running.

For a deployment smoke test, record all slides with audible “um”/“uh” sounds and
deliberate gaps of at least two seconds, inspect the saved transcript and pause
timeline, then reload the account. Try counting: it should receive no baseline. Try unrelated complete speech:
it should show delivery results with limited-topic-coverage feedback. Check permission denial, failed analysis and failed save retries.
Automated fixtures do not establish live microphone or provider accuracy.

Provider references: [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)
and [Gemini audio input](https://ai.google.dev/gemini-api/docs/audio).
