-- Library previews reuse the existing private conversion queue and daily quota.
-- Run after 20261118_cloudconvert.sql and 20261110_presentation_library.sql.
begin;
alter table public.presentations add column if not exists library_entry_id uuid;
create unique index if not exists presentations_library_preview
 on public.presentations(library_entry_id) where library_entry_id is not null and deleted_at is null;

-- Only a verified administrator may create a shared PowerPoint preview.
-- Lock the library entry so concurrent tabs/admins reuse one conversion job.
create or replace function public.library_preview_prepare(p_library uuid,p_admin uuid,p_consent boolean default false)
returns public.presentations language plpgsql security definer set search_path='' as $$
declare l public.presentation_library; p public.presentations; v_id uuid;
begin
 if not exists(select 1 from auth.users where id=p_admin and not coalesce(is_anonymous,false)
   and raw_app_meta_data->>'role'='admin' and raw_app_meta_data->>'must_change_password'='false') then
  raise exception 'administrator_required' using errcode='42501'; end if;
 select * into l from public.presentation_library where id=p_library for update;
 if not found then raise exception 'library_not_found' using errcode='P0002'; end if;
 if l.source<>'upload' or lower(l.file_name) not like '%.pptx' then
  raise exception 'invalid_library_file' using errcode='22023'; end if;
 select * into p from public.presentations where library_entry_id=l.id and deleted_at is null;
 if found then return p; end if;
 if p_consent is distinct from true then raise exception 'conversion_consent_required' using errcode='22023'; end if;
 v_id:=gen_random_uuid();
 insert into public.presentations(id,user_id,title,original_filename,original_file_path,file_type,file_size,library_entry_id,conversion_consent_at)
 values(v_id,p_admin,l.title,'presentation.pptx',p_admin::text||'/'||v_id::text||'.pptx','pptx',l.file_size,l.id,now()) returning * into p;
 return p;
end; $$;

-- Storage copy must finish before validation/conversion can enter the queue.
create or replace function public.library_preview_submit(p_id uuid)
returns public.presentations language plpgsql security definer set search_path='' as $$
declare p public.presentations; v_size bigint;
begin
 select * into p from public.presentations where id=p_id and library_entry_id is not null and deleted_at is null for update;
 if not found or not exists(select 1 from public.presentation_library where id=p.library_entry_id) then
  raise exception 'library_not_found' using errcode='P0002'; end if;
 if p.upload_completed then return p; end if;
 select (metadata->>'size')::bigint into v_size from storage.objects
 where bucket_id='presentation-originals' and name=p.original_file_path;
 if v_size is distinct from p.file_size then raise exception 'upload_incomplete' using errcode='22023'; end if;
 update public.presentations set upload_completed=true,updated_at=now() where id=p.id returning * into p;
 return p;
end; $$;

-- Keep a tombstone for the existing maintenance job to clean private copies and
-- provider exports. Do not touch students' own presentations or practice history.
create or replace function public.library_preview_retire()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.presentations set deleted_at=coalesce(deleted_at,now()),updated_at=now()
 where library_entry_id=old.id and deleted_at is null;
 return old;
end; $$;
drop trigger if exists library_preview_retire on public.presentation_library;
create trigger library_preview_retire before delete on public.presentation_library
 for each row execute function public.library_preview_retire();

revoke all on function public.library_preview_prepare(uuid,uuid,boolean),public.library_preview_submit(uuid),public.library_preview_retire() from public,anon,authenticated;
grant execute on function public.library_preview_prepare(uuid,uuid,boolean),public.library_preview_submit(uuid) to service_role;
notify pgrst,'reload schema';
commit;
