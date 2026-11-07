# Built-in evaluation

The welcome button and the Evaluation sidebar entry open `eval`. Its results use
`evres`, under the same navigation entry. My Presentations, its uploads and its
practice handlers are unchanged.

`assets/evaluation/study-habits.js` contains the five supplied slides verbatim.
They load with the page, require no storage upload or generation request, and are
never inserted into `S.pres`. Evaluation therefore does not consume an upload use.
Previous/Next and arrow keys navigate without restarting speech recognition.

The existing browser recognition pipeline computes metrics, quality, classification
and feedback using the shared assessment modules. Results include the deck ID and
version. Cloud saves still call `complete_browser_evaluation(p_results)` before
updating the local baseline and account snapshot. Failed saves retain retry controls.
Existing completed evaluations open their saved results rather than replacing them.

## Deployment and assumptions

- Deploy the static build; no new environment variables or AI keys are needed.
- Run `supabase/migrations/20261030_evaluation_gate.sql` after the existing
  `20261028_initial_assessment.sql` migration in Supabase SQL Editor. The final
  query must return `complete_browser_evaluation(jsonb)`. This restores the missing
  authenticated baseline-saving RPC. No upload quota changes are made.
- Live authenticated persistence and the SQL migration have not been executed
  from this workspace. After applying SQL, retry saving from an open evaluation;
  deploy the frontend update to expose Retry saving for missing-service errors.
- Uses the currently active browser speech pipeline, not the separate experimental
  provider transcription pipeline. Browser recognition may omit fillers and its
  timing is approximate; results describe those limitations.
- `[Your Name]` is deliberately preserved as supplied. Students say their own name.
- Target duration remains 2–3 minutes, with the existing 20-second minimum and
  five-minute automatic finish. Existing baseline and retake policies are retained.

## Verification

Run `node --test tests/evaluation-ui.test.mjs`, `npm run test:assessment`, and
`npm run build`. For an authenticated smoke test, open Evaluation, navigate all
five slides, speak for 2–3 minutes, finish, check the next-practice recommendations,
and reload to verify the saved baseline. Check that My Presentations and its upload
count are unchanged. Test denied microphone permission and a failed save/retry too.
