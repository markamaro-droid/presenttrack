# Presentation practice

New presentation uploads accept one PDF or one PPTX, up to 50 MB. Each file creates its own presentation. A PPTX never requires a companion PDF. The original File bytes are uploaded unchanged.

PDF uploads render the original file with PDF.js without using conversion credits. PowerPoint uploads are converted to PDF by CloudConvert through authenticated Vercel routes after the student accepts the processing disclosure; the same PDF.js canvas viewer displays the resulting slides. Slide layout is never recreated as HTML text. Fonts and unsupported effects can differ, so converted previews show a fidelity notice. Successful PDFs are cached privately and reused without another conversion.

Existing paired slide PDFs remain usable. Older PPTX files without previews offer the new conversion workflow when opened in Practice, with explicit CloudConvert consent first. New PPT, Word and other unsupported uploads are rejected. Existing unsupported originals remain downloadable, with a clear viewer message.

Text is extracted separately and read-only for practice context (up to 100 pages and 20,000 characters). Image-only slides have no OCR context. PDF previews are static: animations, transitions and embedded media do not play. The original PowerPoint remains available through Download original.

**Full screen** previews slides without recording. Previous/Next, arrow keys, PageUp/PageDown, Home/End and swipe navigate pages. Portrait and landscape slides preserve their proportions on desktop and mobile. Queued or failed previews show status and bounded retry actions.

In Practice, choose a target and accept the audio/text processing consent, then select **Start** under **Your slides**. The app requests full screen directly from that gesture and starts microphone capture. Browsers without usable native fullscreen use the existing window-filling fallback. Pause/Resume and Finish are available during the session; Finish works from any slide. Audio permission and sign-in requirements still apply. Recorded analysis supports 20 seconds to 10 minutes per attempt.

The speech endpoint calculates WPM, long pauses, duration and the rubric score from actual transcription timestamps. Counting, excessive repetition and too little meaningful speech are rejected before scoring. When enough extracted slide text is available, a vocabulary-overlap check also rejects clearly unrelated speech. This is an eligibility check, not semantic grading; image-only slides cannot be checked against text.

If a Gemini key is configured, the original audio also receives a separate verbatim transcription for filler counting. Practice can continue with the Groq transcript when that extra pass is unavailable, with a warning that fillers may be omitted. Fillers without timestamps receive no invented timeline markers. The built-in evaluation requires both passes; see [recorded evaluation setup](docs/EVALUATION.md).

If extracted presentation text is available, the endpoint also requests bounded JSON comments from Groq comparing that text to the transcript. These comments cannot change the measured metrics or score. Chat quota/provider failures preserve the measured report and show that presentation comments were unavailable. Uploaded slide text is treated as data, never model instructions. Source PPT/PDF binaries are not sent to the comment model.

Reports separate **Comments on your presentation** from measured speech feedback. Those metrics and provider settings are unchanged by the new viewer.

## Activate presentation conversion

Follow the [CloudConvert deployment guide](docs/CLOUDCONVERT.md) for migrations, private buckets and RLS, server variables, webhook setup, shared free credits and acceptance checks. Apply `20261117_presentation_conversion.sql` if not already applied, then `20261118_cloudconvert.sql`, and deploy the frontend/backend together. No separate worker is required. Files upload to `presentation-originals`, with generated PDFs in `presentation-previews`. The older `20261109_presentation_file_types.sql` restrictions remain relevant to the legacy bucket.

Validation includes the SQL migrations in local PostgreSQL, API ownership, private downloads, file validation, CloudConvert quotas and request recovery, and real PDF.js browser rendering. `tools/check-pdf-viewer.mjs` covers original bytes, conversion consent, queued conversion, metadata restore, landscape/portrait and responsive/fullscreen sizing with simulated storage. `tools/check-presentation-flow.mjs` checks recording consent, microphone lifecycle, retained-audio retry and contextual reports with mocked audio/PDF/providers. Live microphone, Supabase and CloudConvert responses still require deployment verification. The named school reference PPTX has not been supplied for visual comparison.

Navigation cleanup: dashboard journey steps are informational, repeated next-step/upload/goals shortcuts are removed, and chart data directs readers to the existing report links in Recent attempts. Practice uses one Finish control in the slide toolbar, available during recording both inside and outside fullscreen. Primary sidebar navigation and distinct actions (save, reset, delete, previous/next) remain available.
