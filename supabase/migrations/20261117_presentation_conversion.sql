-- Private originals, immutable PDF previews and a durable, leased conversion queue.
-- Apply after the existing evaluation migrations. Existing uploads remain intact.
begin;
create table public.presentations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  original_filename text not null check (char_length(original_filename) between 1 and 240),
  original_file_path text not null unique,
  preview_pdf_path text,
  file_type text not null check (file_type in ('pptx','pdf')),
  file_size bigint not null check (file_size between 1 and 50000000),
  total_slides integer check (total_slides between 1 and 500),
  conversion_status text not null default 'queued' check (conversion_status in ('queued','processing','completed','failed')),
  conversion_error text,
  error_code text,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings)='array'),
  upload_completed boolean not null default false,
  attempts integer not null default 0 check (attempts between 0 and 3),
  manual_retries integer not null default 0 check (manual_retries between 0 and 2),
  retryable boolean not null default true,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  deleted_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_file_path=user_id::text||'/'||id::text||'.'||file_type)
);
create index presentations_owner on public.presentations(user_id,created_at desc);
create index presentations_queue on public.presentations(available_at,created_at) where deleted_at is null and upload_completed and conversion_status in ('queued','processing');
alter table public.presentations enable row level security;
revoke all on public.presentations from anon,authenticated;
grant select on public.presentations to authenticated;
grant all on public.presentations to service_role;
create policy presentation_owner_read on public.presentations for select to authenticated using (user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('presentation-originals','presentation-originals',false,50000000,array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation']),
 ('presentation-previews','presentation-previews',false,100000000,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy presentation_original_read on storage.objects for select to authenticated using (
 bucket_id='presentation-originals' and exists(select 1 from public.presentations p where p.user_id=auth.uid() and p.deleted_at is null and p.original_file_path=name));
create policy presentation_original_insert on storage.objects for insert to authenticated with check (
 bucket_id='presentation-originals' and exists(select 1 from public.presentations p where p.user_id=auth.uid() and p.deleted_at is null and not p.upload_completed and p.original_file_path=name));
-- No client UPDATE: an original cannot change once uploaded or while a job runs.
create policy presentation_preview_read on storage.objects for select to authenticated using (
 bucket_id='presentation-previews' and exists(select 1 from public.presentations p where p.user_id=auth.uid() and p.deleted_at is null and p.conversion_status='completed' and p.preview_pdf_path=name));

create function public.presentation_create(p_id uuid,p_title text,p_filename text,p_type text,p_size bigint)
returns public.presentations language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_row public.presentations;
begin
 if v_user is null or not exists(select 1 from public.user_data where user_id=v_user and initial_assessment_completed) then
  raise exception 'evaluation_required' using errcode='42501'; end if;
 if p_id is null or p_type is null or p_size is null or p_title is null or p_filename is null
  or p_type not in ('pdf','pptx') or p_size not between 1 and 50000000 or char_length(trim(p_title)) not between 2 and 80
  or char_length(p_filename) not between 1 and 240 or p_filename ~ '[[:cntrl:]/\\]' or lower(p_filename) not like '%.'||p_type then
  raise exception 'invalid_presentation' using errcode='22023'; end if;
 -- Serialize an account's quota checks and make upload retries idempotent.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,17));
 select * into v_row from public.presentations where id=p_id;
 if found then
  if v_row.user_id<>v_user or v_row.deleted_at is not null or v_row.file_size<>p_size or v_row.original_filename<>p_filename or v_row.file_type<>p_type then
   raise exception 'invalid_presentation' using errcode='22023'; end if;
  return v_row;
 end if;
 if (select count(*) from public.presentations where user_id=v_user and deleted_at is null)>=200
  or (select count(*) from public.presentations where user_id=v_user and created_at>now()-interval '1 hour')>=30 then
  raise exception 'presentation_limit' using errcode='P0001'; end if;
 insert into public.presentations(id,user_id,title,original_filename,original_file_path,file_type,file_size)
 values(p_id,v_user,trim(p_title),p_filename,v_user::text||'/'||p_id::text||'.'||p_type,p_type,p_size) returning * into v_row;
 return v_row;
end; $$;

create function public.presentation_submit(p_id uuid,p_retry boolean default false)
returns public.presentations language plpgsql security definer set search_path='' as $$
declare v_row public.presentations; v_size bigint;
begin
 select * into v_row from public.presentations where id=p_id and user_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'presentation_not_found' using errcode='P0002'; end if;
 if p_retry then
  if v_row.conversion_status<>'failed' or not v_row.retryable or v_row.manual_retries>=2 then
   raise exception 'retry_not_allowed' using errcode='22023'; end if;
 elsif v_row.upload_completed then return v_row;
 end if;
 select (metadata->>'size')::bigint into v_size from storage.objects where bucket_id='presentation-originals' and name=v_row.original_file_path;
 if v_size is distinct from v_row.file_size then raise exception 'upload_incomplete' using errcode='22023'; end if;
 update public.presentations set upload_completed=true,conversion_status='queued',conversion_error=null,error_code=null,
  attempts=0,manual_retries=manual_retries+case when p_retry then 1 else 0 end,available_at=now(),lease_token=null,lease_until=null,updated_at=now()
 where id=p_id returning * into v_row;
 return v_row;
end; $$;

create function public.presentation_delete(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.presentations set deleted_at=coalesce(deleted_at,now()),updated_at=now() where id=p_id and user_id=auth.uid();
 return found;
end; $$;

create function public.presentation_claim_job() returns setof public.presentations language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 update public.presentations set conversion_status='failed',error_code='worker_interrupted',conversion_error='Preview processing was interrupted. Retry to resume.',lease_token=null,lease_until=null,updated_at=now()
 where deleted_at is null and conversion_status='processing' and lease_until<now() and attempts>=3;
 select id into v_id from public.presentations where deleted_at is null and upload_completed and attempts<3 and available_at<=now()
  and (conversion_status='queued' or (conversion_status='processing' and lease_until<now()))
 order by available_at,created_at for update skip locked limit 1;
 if v_id is null then return; end if;
 return query update public.presentations set conversion_status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),
  lease_until=now()+interval '10 minutes',updated_at=now() where id=v_id returning *;
end; $$;

create function public.presentation_heartbeat(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.presentations set lease_until=now()+interval '10 minutes' where id=p_id and lease_token=p_token
  and conversion_status='processing' and deleted_at is null and lease_until>now();
 return found;
end; $$;

create function public.presentation_finish(p_id uuid,p_token uuid,p_pages integer default null,p_path text default null,
 p_warnings jsonb default '[]',p_error text default null,p_code text default null,p_retryable boolean default true)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_row public.presentations;
begin
 select * into v_row from public.presentations where id=p_id and lease_token=p_token and lease_until>now()
  and conversion_status='processing' and deleted_at is null for update;
 if not found then return false; end if;
 if p_error is null then
  if p_pages is null or p_pages not between 1 and 500 or p_warnings is null or jsonb_typeof(p_warnings)<>'array' or octet_length(p_warnings::text)>12000
   or (v_row.file_type='pptx' and p_path is distinct from v_row.user_id::text||'/'||p_id::text||'/'||p_token::text||'.pdf')
   or (v_row.file_type='pdf' and p_path is not null) then raise exception 'invalid_result' using errcode='22023'; end if;
  update public.presentations set conversion_status='completed',preview_pdf_path=p_path,total_slides=p_pages,warnings=p_warnings,
   conversion_error=null,error_code=null,lease_until=null,lease_token=null,updated_at=now() where id=p_id;
 else
  update public.presentations set conversion_status=case when p_retryable and attempts<3 then 'queued' else 'failed' end,
   conversion_error=left(p_error,500),error_code=left(p_code,80),retryable=p_retryable,available_at=now()+make_interval(secs=>30*attempts*attempts),
   lease_until=null,lease_token=null,updated_at=now() where id=p_id;
 end if;
 return true;
end; $$;

-- Cleanup remains durable after an interrupted browser upload or deletion.
create function public.presentation_cleanup_candidates() returns setof public.presentations language plpgsql security definer set search_path='' as $$
begin
 delete from public.presentations where storage_deleted_at is not null and created_at<now()-interval '1 hour';
 update public.presentations set deleted_at=now() where not upload_completed and deleted_at is null and created_at<now()-interval '24 hours';
 return query select * from public.presentations where deleted_at is not null and storage_deleted_at is null and (lease_until is null or lease_until<now()) order by deleted_at limit 10;
end; $$;

revoke all on function public.presentation_create(uuid,text,text,text,bigint),public.presentation_submit(uuid,boolean),public.presentation_delete(uuid) from public,anon;
grant execute on function public.presentation_create(uuid,text,text,text,bigint),public.presentation_submit(uuid,boolean),public.presentation_delete(uuid) to authenticated;
revoke all on function public.presentation_claim_job(),public.presentation_heartbeat(uuid,uuid),public.presentation_finish(uuid,uuid,integer,text,jsonb,text,text,boolean),public.presentation_cleanup_candidates() from public,anon,authenticated;
grant execute on function public.presentation_claim_job(),public.presentation_heartbeat(uuid,uuid),public.presentation_finish(uuid,uuid,integer,text,jsonb,text,text,boolean),public.presentation_cleanup_candidates() to service_role;
notify pgrst,'reload schema';
commit;
