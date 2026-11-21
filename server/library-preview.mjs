import { ChatError } from './ai-access.mjs';
import { UUID } from './presentation-storage.mjs';

// Uses the existing leased conversion queue, cached PDFs, webhook and free quota.
export async function libraryPreview({ body, user, conversion }) {
  const db = conversion.db;
  const admin = user.app_metadata?.role === 'admin' && user.app_metadata.must_change_password === false;
  if (body.action !== 'library-preview' && !admin) throw new ChatError(403, 'admin_required', 'An administrator needs to prepare this library preview.');
  const row = (await db.json('/rest/v1/presentation_library?id=eq.' + body.id + '&select=id,title,source,file_path,file_name,file_size,preview_path,published'))?.[0];
  if (!row || !row.published && !admin) throw new ChatError(404, 'library_not_found', 'This library presentation is unavailable or has been hidden.');
  if (row.source === 'builtin') {
    if (!/^assets\/library\/[a-z0-9-]+\.pdf$/.test(row.preview_path || '')) throw new ChatError(404, 'preview_unavailable', 'This library preview is unavailable.');
    return { preview: { state: 'completed', url: '/' + row.preview_path, warnings: [] } };
  }
  if (row.source !== 'upload' || !new RegExp('^' + row.id + '/[a-zA-Z0-9_-]+\\.(pptx|pdf)$').test(row.file_path || '')) throw new ChatError(409, 'invalid_library_file', 'The library file could not be verified.');
  if (/\.pdf$/i.test(row.file_name)) return { preview: { state: 'completed', url: await db.sign('presentation-library', row.file_path), warnings: [] } };
  if (!/\.pptx$/i.test(row.file_name)) throw new ChatError(400, 'invalid_library_file', 'Choose a PDF or PowerPoint presentation.');
  let p;
  try {
    p = (await db.json('/rest/v1/presentations?library_entry_id=eq.' + row.id + '&deleted_at=is.null&select=*'))?.[0];
    if (body.action === 'library-prepare') p = await db.rpc('library_preview_prepare', { p_library: row.id, p_admin: user.id, p_consent: body.cloudconvertConsent === true });
  } catch (error) {
    if (error.code === 'storage_schema_missing') throw new ChatError(503, 'library_preview_setup', 'Library previews need the 20261120_library_previews.sql migration in Supabase.');
    throw error;
  }
  if (!p) return { preview: { state: 'not_prepared', canPrepare: admin, warnings: [] } };
  // Catalog thumbnails only inspect saved results; browsing never runs a job.
  if (body.thumbnail === true && p.conversion_status !== 'completed') return { preview: { state: p.conversion_status, message: p.conversion_error, errorCode: p.error_code } };
  if (!UUID.test(p.id) || !UUID.test(p.user_id) || p.library_entry_id !== row.id || p.file_type !== 'pptx' || p.original_file_path !== p.user_id + '/' + p.id + '.pptx' || !p.conversion_consent_at) throw new ChatError(409, 'invalid_library_preview', 'The saved library preview could not be verified.');
  if (!p.upload_completed) {
    // The source path comes from the protected catalog, never the request body.
    await db.copy('presentation-library', row.file_path, 'presentation-originals', p.original_file_path);
    p = await db.rpc('library_preview_submit', { p_id: p.id });
  }
  if (body.action === 'library-retry') {
    if (!await conversion.retry(p.id, p.user_id)) throw new ChatError(409, 'retry_not_allowed', 'This preview cannot be retried yet. Wait for the displayed retry time or upload a PDF export.');
  } else if (p.conversion_status !== 'completed') await conversion.advance(p.id);
  p = await db.presentation(p.id);
  // Recheck visibility after a potentially long conversion or a concurrent delete.
  const current = (await db.json('/rest/v1/presentation_library?id=eq.' + row.id + '&select=id,published'))?.[0];
  if (!current || !current.published && !admin || !p || p.deleted_at) throw new ChatError(404, 'library_not_found', 'This library presentation is unavailable or has been hidden.');
  const preview = { state: p.conversion_status, totalSlides: p.total_slides, message: p.conversion_error, errorCode: p.error_code,
    retryable: admin && p.retryable === true && p.conversion_status === 'failed', nextCheckAt: p.available_at, warnings: p.warnings || [] };
  if (preview.state === 'completed') {
    if (!UUID.test(p.conversion_id) || p.preview_pdf_path !== p.user_id + '/cache/' + p.conversion_id + '.pdf') throw new ChatError(409, 'invalid_library_preview', 'The saved PDF could not be verified.');
    preview.url = await db.sign('presentation-previews', p.preview_pdf_path);
  }
  return { preview };
}
