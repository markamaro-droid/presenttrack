# Presentation practice

New presentation uploads accept only PDF and PPTX, up to 50 MB per file. PowerPoint uploads require a PDF exported from the same deck. The original PowerPoint and its PDF export are stored separately and uploaded as the original File bytes. Neither is rewritten. The viewer renders the PDF with the existing PDF.js renderer instead of rebuilding slides from extracted paragraphs.

Existing PowerPoint entries can attach their PDF from the Practice viewer. Existing Word uploads remain in the library, but new Word uploads are not accepted. A plain PDF upload needs no second file.

Text is extracted read-only for practice context (up to 100 pages / 20,000 characters); it is not used to redraw slides. PPTX uploads prefer text from the original deck, with the companion PDF as a fallback. Legacy PPT uses the companion PDF text. Image-only PDFs have no OCR, so they retain their appearance but provide no text context. A PDF export is a static representation: PowerPoint animations, transitions and embedded media are not played.

In Practice, choose a target and accept the audio/text processing consent, then select **Start** under **Your slides**. The app requests full screen directly from that gesture and starts microphone capture. Browsers without usable native fullscreen use the existing window-filling fallback. Pause/Resume and Finish are available during the session; Finish works from any slide. Audio permission and sign-in requirements still apply. Recorded analysis supports 20 seconds to 10 minutes per attempt.

The speech endpoint continues calculating WPM, filler words, long pauses, duration and the rubric score from actual transcription timestamps. If extracted presentation text is available, it also requests bounded JSON comments from Groq comparing that text to the transcript. These comments cannot change the measured metrics or score. Chat quota/provider failures preserve the measured report and show that presentation comments were unavailable. Uploaded slide text is treated as data, never model instructions. Source PPT/PDF binaries are not sent to the comment model.

Reports separate **Comments on your presentation** from measured speech feedback. No new API key or conversion service is required. Deploy the updated frontend and backend together; apply the bucket restriction below to enforce the allowed formats for older clients too.

## Activate strict file restrictions

Apply `supabase/migrations/20261109_presentation_file_types.sql` in the Supabase SQL Editor (or via your normal migration workflow). It restricts the `presentations` bucket to PDF and PPTX MIME types so the Storage API rejects DOCX uploads from older clients. It updates bucket configuration only, with no changes to existing files or ownership policies. Then deploy the current app build to Vercel so the file picker and drop handler show the same restriction. MIME restrictions check the declared media type; current frontend validation also parses PDF/PPTX structure before upload.

Equivalent dashboard configuration: Storage → presentations → bucket settings → Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`.

Validation: unit coverage includes allowed formats, read-only PDF scanning, context bounds, authentication/consent, optional comment failures, and unchanged metric scores. `tools/check-presentation-flow.mjs` checks uploads, original byte preservation, Start/consent/fullscreen/capture and contextual reports at desktop and phone widths using mocked audio, PDF rendering and providers. Live microphone, real account storage, real document rendering and Groq responses require deployment verification.
