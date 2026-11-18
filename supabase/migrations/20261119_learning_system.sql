-- Additive learning history. Original files, account flags and workspace records are retained.
begin;
create table if not exists public.learning_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  presentation_id uuid references public.presentations(id) on delete set null,
  title text not null,
  kind text not null check(kind in ('baseline','reassessment','practice','legacy')),
  status text not null default 'completed' check(status in ('pending','processing','completed','failed')),
  result jsonb not null,
  legacy_key text,
  created_at timestamptz not null default now(),
  unique(user_id,id)
);
create unique index if not exists learning_one_baseline on public.learning_sessions(user_id) where kind='baseline';
create index if not exists learning_history on public.learning_sessions(user_id,created_at desc);
create index if not exists learning_by_presentation on public.learning_sessions(user_id,presentation_id,created_at desc);
-- Only identifiers are retained after deletion, to prevent stale autosaves restoring transcripts.
create table if not exists public.learning_deletions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, legacy_key text
);
create index if not exists learning_deletion_owner on public.learning_deletions(user_id);
create unique index if not exists learning_legacy_import on public.learning_sessions(user_id,legacy_key) where legacy_key is not null;
create table if not exists public.presentation_understanding (
  presentation_id uuid primary key references public.presentations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('pending','processing','completed','failed')),
  version integer not null default 1,
  source jsonb, analysis jsonb, error text,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists understanding_owner on public.presentation_understanding(user_id);
create table if not exists public.learning_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  conversation_history boolean not null default false,
  retention_days integer not null default 30 check(retention_days in (30,90,365)),
  pause_threshold numeric not null default 2 check(pause_threshold between 1 and 5),
  coaching_style text not null default 'Supportive and specific' check(char_length(coaching_style)<=200)
);
create table if not exists public.tracy_conversations (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check(char_length(question)<=2000),
  answer text not null check(char_length(answer)<=6000),
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index if not exists tracy_conversation_history on public.tracy_conversations(user_id,created_at desc);
create index if not exists tracy_conversation_expiry on public.tracy_conversations(expires_at);
create table if not exists public.tracy_memories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check(char_length(content) between 1 and 500),
  source text not null default 'user-approved', created_at timestamptz not null default now()
);
create index if not exists tracy_memory_owner on public.tracy_memories(user_id);

-- Historical JSON remains intact. The earliest available recorded baseline becomes immutable.
insert into public.learning_sessions(id,user_id,title,kind,result,created_at)
select gen_random_uuid(),user_id,'Initial Evaluation','baseline',data#>'{ev,results}',
  coalesce(initial_assessment_completed_at,created_at,now()) from public.user_data
where data#>>'{ev,results,source}'='recorded-evaluation' and data#>>'{ev,results,contentValidation,eligible}'='true'
on conflict do nothing;
insert into public.learning_sessions(id,user_id,title,kind,result,legacy_key,created_at)
select gen_random_uuid(),d.user_id,left(coalesce(s->>'deck','Previous practice'),160),'legacy',
  (s->'analysis')||jsonb_build_object('importedFromWorkspace',true,'legacyTimestamp',s->>'at'),s->>'id',coalesce(d.updated_at,d.created_at,now())
from public.user_data d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data->'ses')='array' then d.data->'ses' else '[]' end) s
where s->>'source'='recorded-audio' and jsonb_typeof(s->'analysis')='object' and s->>'id' is not null
on conflict do nothing;

do $$ declare t text; begin
  foreach t in array array['learning_sessions','learning_deletions','presentation_understanding','learning_preferences','tracy_conversations','tracy_memories'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists own_learning_rows on public.%I',t);
    execute format('create policy own_learning_rows on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
  end loop;
end $$;

-- Only the authenticated server analysis pipeline can commit new measured results.
create or replace function public.save_learning_session(p_user uuid,p_id uuid,p_presentation uuid,p_title text,p_evaluation boolean,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.learning_sessions; v_kind text; v_baseline jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,19));
  if exists(select 1 from public.learning_deletions where id=p_id) then raise exception 'session_deleted' using errcode='22023'; end if;
  select * into v_row from public.learning_sessions where id=p_id and user_id=p_user;
  if found then return to_jsonb(v_row); end if;
  if p_presentation is not null and not exists(select 1 from public.presentations where id=p_presentation and user_id=p_user and deleted_at is null) then
    raise exception 'presentation_not_owned' using errcode='42501';
  end if;
  if coalesce(p_result#>>'{quality,level}','') not in ('ok','low') or p_result#>>'{contentValidation,eligible}' is distinct from 'true' then
    raise exception 'invalid_result' using errcode='22023';
  end if;
  if p_evaluation and (p_result->>'source' is distinct from 'recorded-evaluation' or p_result#>>'{explanationQuality,status}' is distinct from 'completed') then
    raise exception 'incomplete_evaluation' using errcode='22023';
  end if;
  v_kind:=case when not p_evaluation then 'practice' when exists(select 1 from public.learning_sessions where user_id=p_user and kind='baseline') then 'reassessment' else 'baseline' end;
  insert into public.learning_sessions(id,user_id,presentation_id,title,kind,result)
  values(p_id,p_user,p_presentation,left(p_title,160),v_kind,p_result) returning * into v_row;
  if p_evaluation then
    select result into v_baseline from public.learning_sessions where user_id=p_user and kind='baseline';
    insert into public.user_data(user_id,data,initial_assessment_completed,initial_assessment_completed_at)
    values(p_user,jsonb_build_object('ev',jsonb_build_object('done',true,'at',v_baseline->>'created_at','results',v_baseline)),true,now())
    on conflict(user_id) do update set initial_assessment_completed=true,
      initial_assessment_completed_at=coalesce(public.user_data.initial_assessment_completed_at,now()),
      data=jsonb_set(coalesce(public.user_data.data,'{}'),'{ev}',excluded.data->'ev'),updated_at=now();
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.save_learning_session(uuid,uuid,uuid,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.save_learning_session(uuid,uuid,uuid,text,boolean,jsonb) to service_role;
-- The old result-envelope RPC could overwrite a baseline with browser-supplied scores.
revoke all on function public.complete_recorded_evaluation(jsonb) from authenticated,anon;

create or replace function public.claim_presentation_understanding(p_user uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if not exists(select 1 from public.presentations where id=p_id and user_id=p_user and deleted_at is null) then raise exception 'presentation_not_owned' using errcode='42501'; end if;
  insert into public.presentation_understanding(presentation_id,user_id,status) values(p_id,p_user,'pending') on conflict do nothing;
  update public.presentation_understanding set status='processing',lease_until=now()+interval '90 seconds',error=null
  where presentation_id=p_id and user_id=p_user and status<>'completed' and (lease_until is null or lease_until<now());
  get diagnostics v_count=row_count;return v_count=1;
end;
$$;
revoke all on function public.claim_presentation_understanding(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_presentation_understanding(uuid,uuid) to service_role;

-- Preserve the canonical baseline when the ordinary workspace autosave replaces data.
create or replace function public.preserve_learning_baseline() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.learning_sessions;
begin
  select * into b from public.learning_sessions where user_id=new.user_id and kind='baseline';
  if found then
    new.data:=jsonb_set(coalesce(new.data,'{}'),'{ev}',jsonb_build_object('done',true,'at',b.created_at,'results',b.result));
    new.initial_assessment_completed:=true;
  end if;
  if jsonb_typeof(new.data->'ses')='array' then
    new.data:=jsonb_set(new.data,'{ses}',coalesce((select jsonb_agg(s) from jsonb_array_elements(new.data->'ses') s
      where not exists(select 1 from public.learning_deletions d where d.user_id=new.user_id
        and (s->>'remoteSessionId'=d.id::text or s->>'id'=d.legacy_key))),'[]'));
  end if;
  return new;
end; $$;
drop trigger if exists preserve_learning_baseline on public.user_data;
create trigger preserve_learning_baseline before insert or update on public.user_data for each row execute function public.preserve_learning_baseline();

create or replace function public.delete_learning_session(p_user uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare item public.learning_sessions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,19));
  select * into item from public.learning_sessions where user_id=p_user and id=p_id for update;
  if not found or item.kind='baseline' then return false; end if;
  insert into public.learning_deletions(id,user_id,legacy_key) values(p_id,p_user,item.legacy_key) on conflict do nothing;
  update public.user_data set data=jsonb_set(coalesce(data,'{}'),'{ses}',coalesce((select jsonb_agg(s) from jsonb_array_elements(case when jsonb_typeof(data->'ses')='array' then data->'ses' else '[]' end) s
    where s->>'remoteSessionId' is distinct from p_id::text and (item.legacy_key is null or s->>'id' is distinct from item.legacy_key)),'[]')) where user_id=p_user;
  delete from public.learning_sessions where user_id=p_user and id=p_id;
  return true;
end; $$;
revoke all on function public.delete_learning_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_learning_session(uuid,uuid) to service_role;

create or replace function public.take_learning_slot(p_user uuid,p_kind text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_kind not in ('understanding','explanation') then raise exception 'invalid_kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,20));
  if (select count(*) from public.ai_usage where user_id=p_user and kind='learning_'||p_kind and created_at>now()-interval '1 minute')>=10
    or (select count(*) from public.ai_usage where user_id=p_user and kind='learning_'||p_kind and created_at>now()-interval '24 hours')>=(case when p_kind='understanding' then 200 else 20 end) then return false; end if;
  insert into public.ai_usage(user_id,kind) values(p_user,'learning_'||p_kind);return true;
end; $$;
revoke all on function public.take_learning_slot(uuid,text) from public,anon,authenticated;
grant execute on function public.take_learning_slot(uuid,text) to service_role;
-- Serialize consent changes and conversation writes. An in-flight reply cannot revive disabled history.
create or replace function public.set_learning_preferences(p_user uuid,p_preferences jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,21));
  insert into public.learning_preferences(user_id,conversation_history,retention_days,pause_threshold,coaching_style)
  values(p_user,(p_preferences->>'conversation_history')::boolean,(p_preferences->>'retention_days')::integer,(p_preferences->>'pause_threshold')::numeric,p_preferences->>'coaching_style')
  on conflict(user_id) do update set conversation_history=excluded.conversation_history,retention_days=excluded.retention_days,pause_threshold=excluded.pause_threshold,coaching_style=excluded.coaching_style;
  if not (p_preferences->>'conversation_history')::boolean then delete from public.tracy_conversations where user_id=p_user;
  else update public.tracy_conversations set expires_at=least(expires_at,created_at+make_interval(days=>(p_preferences->>'retention_days')::integer)) where user_id=p_user; end if;
end; $$;
revoke all on function public.set_learning_preferences(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_learning_preferences(uuid,jsonb) to service_role;
create or replace function public.save_tracy_conversation(p_user uuid,p_id uuid,p_question text,p_answer text) returns boolean
language plpgsql security definer set search_path='' as $$
declare prefs public.learning_preferences;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,21));
  select * into prefs from public.learning_preferences where user_id=p_user;
  if not found or not prefs.conversation_history then return false; end if;
  insert into public.tracy_conversations(id,user_id,question,answer,expires_at) values(p_id,p_user,p_question,p_answer,now()+make_interval(days=>prefs.retention_days));
  return true;
end; $$;
revoke all on function public.save_tracy_conversation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_tracy_conversation(uuid,uuid,text,text) to service_role;
create or replace function public.purge_expired_tracy_conversations() returns void
language sql security definer set search_path='' as $$delete from public.tracy_conversations where expires_at<now()$$;
revoke all on function public.purge_expired_tracy_conversations() from public,anon,authenticated;
grant execute on function public.purge_expired_tracy_conversations() to service_role;
notify pgrst,'reload schema';
commit;
