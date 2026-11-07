-- Persistent generated Tracy audio. Microphone recordings are NOT stored here.
-- Private per-account folders; no service-role credential is required.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracy-speech-cache', 'tracy-speech-cache', false, 2800000, array['audio/wav'])
on conflict (id) do update set public = false, file_size_limit = 2800000, allowed_mime_types = array['audio/wav'];

drop policy if exists tracy_speech_cache_read on storage.objects;
create policy tracy_speech_cache_read on storage.objects for select to authenticated
using (bucket_id = 'tracy-speech-cache'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));

drop policy if exists tracy_speech_cache_insert on storage.objects;
create policy tracy_speech_cache_insert on storage.objects for insert to authenticated
with check (bucket_id = 'tracy-speech-cache'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name ~ '^[0-9a-f-]+/[0-9a-f]{64}\.wav$'
  and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));

-- No update/delete policy: ordinary clients cannot overwrite existing clips.
