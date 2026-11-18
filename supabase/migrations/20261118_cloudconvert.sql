-- Apply after 20261117_presentation_conversion.sql, including on new projects.
-- Existing originals and completed previews remain valid. No external worker.
begin;
create table public.presentation_conversion_cache (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), profile text not null default 'cloudconvert-office-pdf-v1',
 original_file_path text not null, source_slides integer not null check(source_slides between 1 and 500),
 state text not null default 'queued' check(state in ('queued','starting','processing','completed','failed')),
 preview_pdf_path text, total_slides integer, warnings jsonb not null default '[]',
 error text, error_code text, retryable boolean not null default true, manual_retries integer not null default 0 check(manual_retries between 0 and 2),
 attempt_id uuid, dispatch_started_at timestamptz, provider_job_id uuid, provider_deleted boolean not null default false,
 quota_day date, reservation_settled boolean not null default true, credits_used integer,
 next_attempt_at timestamptz not null default now(), poll_after timestamptz not null default now(),
 lock_token uuid, lock_until timestamptz, retired_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jsonb_typeof(warnings)='array'),
 check(preview_pdf_path is null or preview_pdf_path=user_id::text||'/cache/'||id::text||'.pdf')
);
create unique index presentation_cloud_content on public.presentation_conversion_cache(user_id,sha256,profile) where retired_at is null;
create unique index presentation_cloud_attempt on public.presentation_conversion_cache(attempt_id) where attempt_id is not null;
create unique index presentation_cloud_job on public.presentation_conversion_cache(provider_job_id) where provider_job_id is not null;
create index presentation_cloud_due on public.presentation_conversion_cache(poll_after,next_attempt_at);
alter table public.presentation_conversion_cache enable row level security;
revoke all on public.presentation_conversion_cache from public,anon,authenticated;
grant all on public.presentation_conversion_cache to service_role;

create table public.presentation_conversion_usage (
 day date primary key, reserved integer not null default 0 check(reserved>=0), spent integer not null default 0 check(spent>=0),
 provider_remaining integer, checked_at timestamptz
);
alter table public.presentation_conversion_usage enable row level security;
revoke all on public.presentation_conversion_usage from public,anon,authenticated;
grant all on public.presentation_conversion_usage to service_role;
alter table public.presentations add column conversion_id uuid references public.presentation_conversion_cache(id) on delete set null;
alter table public.presentations add column conversion_consent_at timestamptz;
create index presentations_conversion on public.presentations(conversion_id) where deleted_at is null;
-- Stop the previous queue consumer even if an old Railway container is left running.
revoke execute on function public.presentation_claim_job(),public.presentation_heartbeat(uuid,uuid) from service_role;
update public.presentations set conversion_status='queued',lease_token=null,lease_until=null,attempts=0,
 conversion_error=null,error_code=null,available_at=now()
 where conversion_status in ('queued','processing') or (conversion_status='failed' and retryable);

create function public.presentation_cloud_sync(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.presentation_conversion_cache;
begin
 select * into c from public.presentation_conversion_cache where id=p_id for share;
 if not found then return; end if;
 update public.presentations set conversion_status=case when c.state='starting' then 'processing' else c.state end,
  preview_pdf_path=c.preview_pdf_path,total_slides=c.total_slides,warnings=c.warnings,
  conversion_error=c.error,error_code=c.error_code,retryable=c.retryable,manual_retries=c.manual_retries,
  available_at=c.next_attempt_at,updated_at=now()
 where conversion_id=c.id and user_id=c.user_id and deleted_at is null;
end; $$;

-- User RPC cannot mark content valid. The server does that after reading bytes.
create or replace function public.presentation_submit(p_id uuid,p_retry boolean default false)
returns public.presentations language plpgsql security definer set search_path='' as $$
declare p public.presentations; v_size bigint;
begin
 select * into p from public.presentations where id=p_id and user_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'presentation_not_found' using errcode='P0002'; end if;
 if p_retry then raise exception 'retry_through_api' using errcode='22023'; end if;
 if p.upload_completed then return p; end if;
 select (metadata->>'size')::bigint into v_size from storage.objects where bucket_id='presentation-originals' and name=p.original_file_path;
 if v_size is distinct from p.file_size then raise exception 'upload_incomplete' using errcode='22023'; end if;
 update public.presentations set upload_completed=true,conversion_status='queued',updated_at=now() where id=p_id returning * into p;
 return p;
end; $$;

create function public.presentation_validation_claim(p_id uuid) returns setof public.presentations
language plpgsql security definer set search_path='' as $$
begin
 return query update public.presentations set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',conversion_status='processing'
 where id=p_id and deleted_at is null and upload_completed and conversion_id is null and conversion_status in ('queued','processing')
 and (file_type='pdf' or conversion_consent_at is not null) and (lease_until is null or lease_until<now()) returning *;
end; $$;

create function public.presentation_cloud_bind(p_id uuid,p_token uuid,p_hash text,p_slides integer,p_warnings jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.presentations; v_id uuid;
begin
 select * into p from public.presentations where id=p_id and lease_token=p_token and lease_until>now() and deleted_at is null for update;
 if not found or p.file_type<>'pptx' or p.conversion_consent_at is null then return null; end if;
 insert into public.presentation_conversion_cache(user_id,sha256,original_file_path,source_slides,warnings)
 values(p.user_id,p_hash,p.original_file_path,p_slides,p_warnings)
 on conflict(user_id,sha256,profile) where retired_at is null do update set sha256=excluded.sha256 returning id into v_id;
 update public.presentations set conversion_id=v_id,lease_token=null,lease_until=null where id=p_id;
 perform public.presentation_cloud_sync(v_id);return v_id;
end; $$;

create function public.presentation_cloud_lock(p_id uuid) returns setof public.presentation_conversion_cache
language plpgsql security definer set search_path='' as $$
begin
 return query update public.presentation_conversion_cache set lock_token=gen_random_uuid(),lock_until=now()+interval '2 minutes'
 where id=p_id and (lock_until is null or lock_until<now()) and poll_after<=now() returning *;
end; $$;

-- One shared UTC budget, not ten credits per student. 60-second conversion
-- timeout bounds the current Office-to-PDF base cost to two credits per attempt.
create function public.presentation_cloud_reserve(p_id uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.presentation_conversion_cache; u public.presentation_conversion_usage; d date:=(now() at time zone 'UTC')::date;
begin
 select * into c from public.presentation_conversion_cache where id=p_id and lock_token=p_token and lock_until>now() for update;
 if not found or c.retired_at is not null or c.state<>'queued' or c.next_attempt_at>now() or c.attempt_id is not null then return false; end if;
 insert into public.presentation_conversion_usage(day) values(d) on conflict do nothing;
 select * into u from public.presentation_conversion_usage where day=d for update;
 if u.spent+u.reserved+2>10 then
  update public.presentation_conversion_cache set error_code='daily_quota',error='The shared daily conversion allowance is used up. Your original is saved; the app will check again tomorrow.',
   next_attempt_at=((d+1)::timestamp at time zone 'UTC')+interval '5 minutes',poll_after=((d+1)::timestamp at time zone 'UTC')+interval '5 minutes' where id=p_id;
  perform public.presentation_cloud_sync(p_id);return false;
 end if;
 update public.presentation_conversion_usage set reserved=reserved+2 where day=d;
 update public.presentation_conversion_cache set state='starting',attempt_id=gen_random_uuid(),quota_day=d,reservation_settled=false,
  provider_job_id=null,provider_deleted=false,dispatch_started_at=null,error=null,error_code=null,credits_used=null,updated_at=now() where id=p_id;
 return true;
end; $$;

create function public.presentation_cloud_retire(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 -- The cache key leaves the unique index before any object is removed. A new
 -- upload cannot attach to a preview that is being garbage-collected.
 update public.presentation_conversion_cache c set retired_at=coalesce(retired_at,now()),poll_after=now()
 where id=p_id and (lock_until is null or lock_until<now()) and not exists(
  select 1 from public.presentations p where p.conversion_id=c.id and p.deleted_at is null);
 return found;
end; $$;

create function public.presentation_cloud_settle(p_id uuid,p_token uuid,p_credits integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.presentation_conversion_cache;
begin
 if p_credits is null or p_credits not between 0 and 100 then raise exception 'invalid_credits' using errcode='22023'; end if;
 select * into c from public.presentation_conversion_cache where id=p_id and lock_token=p_token and lock_until>now() for update;
 if not found then return false; end if;
 if c.reservation_settled then return true; end if;
 update public.presentation_conversion_usage set reserved=greatest(0,reserved-2),spent=spent+p_credits where day=c.quota_day;
 update public.presentation_conversion_cache set reservation_settled=true,credits_used=p_credits where id=p_id;
 return true;
end; $$;

create function public.presentation_cloud_retry(p_id uuid,p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.presentation_conversion_cache;
begin
 select cache.* into c from public.presentation_conversion_cache cache join public.presentations p on p.conversion_id=cache.id
 where p.id=p_id and p.user_id=p_user and p.deleted_at is null for update of cache;
 if not found or c.state<>'failed' or not c.retryable or c.manual_retries>=2 or not c.reservation_settled
  or (c.provider_job_id is not null and not c.provider_deleted) or c.next_attempt_at>now() or c.lock_until>now() then return false; end if;
 update public.presentation_conversion_cache set state='queued',manual_retries=manual_retries+1,error=null,error_code=null,
  attempt_id=null,dispatch_started_at=null,provider_job_id=null,provider_deleted=false,poll_after=now(),next_attempt_at=now() where id=c.id;
 perform public.presentation_cloud_sync(c.id);return true;
end; $$;

-- Server-only functions: browsers cannot forge hashes, consent receipts,
-- provider IDs, quota settlements, valid PDFs or cache ownership.
revoke all on function public.presentation_cloud_sync(uuid),public.presentation_validation_claim(uuid),public.presentation_cloud_bind(uuid,uuid,text,integer,jsonb),
 public.presentation_cloud_lock(uuid),public.presentation_cloud_reserve(uuid,uuid),public.presentation_cloud_settle(uuid,uuid,integer),public.presentation_cloud_retry(uuid,uuid),public.presentation_cloud_retire(uuid) from public,anon,authenticated;
grant execute on function public.presentation_cloud_sync(uuid),public.presentation_validation_claim(uuid),public.presentation_cloud_bind(uuid,uuid,text,integer,jsonb),
 public.presentation_cloud_lock(uuid),public.presentation_cloud_reserve(uuid,uuid),public.presentation_cloud_settle(uuid,uuid,integer),public.presentation_cloud_retry(uuid,uuid),public.presentation_cloud_retire(uuid) to service_role;
notify pgrst,'reload schema';
commit;
