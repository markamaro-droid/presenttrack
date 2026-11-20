import { ChatError } from './ai-access.mjs';

// Called only after /api/admin verifies the current server-controlled admin role.
export async function deleteLibraryPresentation({ id, env, fetchImpl }) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    throw new ChatError(400, 'invalid_presentation', 'Choose a valid library presentation.');
  }
  id = id.toLowerCase();
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  const call = (path, options = {}) => fetchImpl(base + path, { headers, ...options, signal: AbortSignal.timeout(8000) });
  const path = '/rest/v1/presentation_library?id=eq.' + id;
  const found = await call(path + '&select=id,source,file_path,preview_path');
  if (!found.ok) throw new ChatError(503, 'library_unavailable', 'Could not load this library presentation. Please retry.');
  const rows = await found.json();
  if (!Array.isArray(rows)) throw new ChatError(503, 'library_unavailable', 'Could not load this library presentation. Please retry.');
  if (!rows.length) return { deleted: true }; // Safe to retry after an interrupted response.
  const row = rows[0];
  if (row.source !== 'upload') throw new ChatError(403, 'builtin_presentation', 'Built-in presentations can be hidden by turning off Published. Only uploaded presentations can be deleted.');
  if (row.id !== id || row.preview_path != null || !new RegExp('^' + id + '/[a-zA-Z0-9_-]+\\.(pptx|pdf)$').test(row.file_path || '')) {
    throw new ChatError(409, 'invalid_library_file', 'This library file could not be verified. No files were deleted.');
  }
  // Hide first. If either service fails, the hidden row retains the exact file
  // path for a safe retry. Student practice copies live in separate buckets.
  const scoped = path + '&source=eq.upload&file_path=eq.' + encodeURIComponent(row.file_path);
  const hidden = await call(scoped, { method: 'PATCH', body: JSON.stringify({ published: false }) });
  if (!hidden.ok) throw new ChatError(503, 'library_delete_failed', 'Could not hide the presentation before deleting it. Please retry.');
  try {
    const removed = await call('/storage/v1/object/presentation-library', { method: 'DELETE', body: JSON.stringify({ prefixes: [row.file_path] }) });
    if (!removed.ok) throw Error('storage');
    const deleted = await call(scoped, { method: 'DELETE' });
    if (!deleted.ok) throw Error('catalog');
  } catch {
    throw new ChatError(503, 'library_delete_pending', 'The presentation is hidden, but deletion could not finish. Click Delete again to complete it.');
  }
  return { deleted: true };
}
