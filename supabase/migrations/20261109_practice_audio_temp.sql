-- Private staging for recordings that exceed the inline request limit.
-- The API and browser attempt deletion after processing, including failures.
-- Interrupted uploads/cleanup failures can leave objects: periodically remove
-- objects older than one day using the Storage API (not SQL DELETE).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-audio-temp', 'practice-audio-temp', false, 25000000,
  array['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists practice_audio_temp_insert on storage.objects;
create policy practice_audio_temp_insert on storage.objects for insert to authenticated
with check (bucket_id = 'practice-audio-temp'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name ~ '^[0-9a-f-]+/[0-9a-f-]+$'
  and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));

drop policy if exists practice_audio_temp_read on storage.objects;
create policy practice_audio_temp_read on storage.objects for select to authenticated
using (bucket_id = 'practice-audio-temp'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));

drop policy if exists practice_audio_temp_delete on storage.objects;
create policy practice_audio_temp_delete on storage.objects for delete to authenticated
using (bucket_id = 'practice-audio-temp'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));
