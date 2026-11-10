# Presentation practice

New presentation uploads accept one PDF or one PPTX, up to 50 MB. Each file creates its own presentation. A PPTX never requires a companion PDF. The original File bytes are uploaded unchanged.

PDF uploads use the existing PDF.js renderer and preserve the original slide layout. PPTX-only uploads extract text per slide for an explicitly labelled text-only practice preview. Formatting, images, charts and animations are not reproduced. Image-only PowerPoint slides display a no-readable-text notice; text is never invented. For an exact visual layout, upload a PDF export as its own presentation.

Existing entries with an attached slide PDF keep using it. Legacy PPT entries can still attach a PDF from Practice; new PPT uploads are not accepted. Existing Word uploads remain in the library, but new Word uploads are not accepted.

Text is extracted read-only for practice context (up to 100 slides/pages and 20,000 characters). PPTX previews indicate truncation when the text limit is reached. Image-only PDFs have no OCR, so they retain their appearance but provide no text context. PDF exports are static: PowerPoint animations, transitions and embedded media are not played.

In Practice, choose a target and accept the audio/text processing consent, then select **Start** under **Your slides**. The app requests full screen directly from that gesture and starts microphone capture. Browsers without usable native fullscreen use the existing window-filling fallback. Pause/Resume and Finish are available during the session; Finish works from any slide. Audio permission and sign-in requirements still apply. Recorded analysis supports 20 seconds to 10 minutes per attempt.

The speech endpoint calculates WPM, long pauses, duration and the rubric score from actual transcription timestamps. Counting, excessive repetition and too little meaningful speech are rejected before scoring. When enough extracted slide text is available, a vocabulary-overlap check also rejects clearly unrelated speech. This is an eligibility check, not semantic grading; image-only slides cannot be checked against text.

If a Gemini key is configured, the original audio also receives a separate verbatim transcription for filler counting. Practice can continue with the Groq transcript when that extra pass is unavailable, with a warning that fillers may be omitted. Fillers without timestamps receive no invented timeline markers. The built-in evaluation requires both passes; see [recorded evaluation setup](docs/EVALUATION.md).

If extracted presentation text is available, the endpoint also requests bounded JSON comments from Groq comparing that text to the transcript. These comments cannot change the measured metrics or score. Chat quota/provider failures preserve the measured report and show that presentation comments were unavailable. Uploaded slide text is treated as data, never model instructions. Source PPT/PDF binaries are not sent to the comment model.

Reports separate **Comments on your presentation** from measured speech feedback. No new API key or conversion service is required. Deploy the updated frontend and backend together; apply the bucket restriction below to enforce the allowed formats for older clients too.

## Activate strict file restrictions

Apply `supabase/migrations/20261109_presentation_file_types.sql` in the Supabase SQL Editor (or via your normal migration workflow). It restricts the `presentations` bucket to PDF and PPTX MIME types so the Storage API rejects DOCX uploads from older clients. It updates bucket configuration only, with no changes to existing files or ownership policies. Then deploy the current app build to Vercel so the file picker and drop handler show the same restriction. MIME restrictions check the declared media type; current frontend validation also parses PDF/PPTX structure before upload.

Equivalent dashboard configuration: Storage → presentations → bucket settings → Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`.

Validation: unit coverage includes allowed formats, read-only PDF scanning, context bounds, authentication/consent, optional comment failures, and unchanged metric scores. `tools/check-presentation-flow.mjs` checks uploads, original byte preservation, Start/consent/fullscreen/capture and contextual reports at desktop and phone widths using mocked audio, PDF rendering and providers. Live microphone, real account storage, real document rendering and Groq responses require deployment verification.

Navigation cleanup: dashboard journey steps are informational, repeated next-step/upload/goals shortcuts are removed, and chart data directs readers to the existing report links in Recent attempts. Practice uses one Finish control in the slide toolbar, available during recording both inside and outside fullscreen. Primary sidebar navigation and distinct actions (save, reset, delete, previous/next) remain available.
