-- Usage metadata only. No voice recordings or transcripts are stored.
-- Self-contained if the initial assessment migration has not created ai_usage yet.
create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_user_kind_created_idx on public.ai_usage(user_id, kind, created_at);

create or replace function public.take_tracy_slot(p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_kind text;
  v_now timestamptz;
  v_minute integer; v_hour integer; v_day integer;
  v_min_limit integer; v_hour_limit integer; v_day_limit integer;
  v_window interval; v_retry integer;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise insufficient_privilege using message = 'authenticated account required';
  end if;
  if p_kind = 'voice' then
    v_kind := 'tracy_voice'; v_min_limit := 2; v_hour_limit := 6; v_day_limit := 12;
  elsif p_kind = 'chat' then
    v_kind := 'robot_chat'; v_min_limit := 5; v_hour_limit := 30; v_day_limit := 100;
  else
    raise invalid_parameter_value using message = 'invalid usage kind';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_kind || ':' || v_user::text, 0));
  v_now := clock_timestamp();
  select count(*) filter (where created_at > v_now - interval '1 minute'),
         count(*) filter (where created_at > v_now - interval '1 hour'), count(*)
    into v_minute, v_hour, v_day from public.ai_usage
    where user_id = v_user and kind = v_kind and created_at > v_now - interval '1 day';
  if v_minute >= v_min_limit or v_hour >= v_hour_limit or v_day >= v_day_limit then
    v_window := case when v_day >= v_day_limit then interval '1 day' when v_hour >= v_hour_limit then interval '1 hour' else interval '1 minute' end;
    select greatest(1, ceil(extract(epoch from min(created_at) + v_window - v_now))::integer)
      into v_retry from public.ai_usage
      where user_id = v_user and kind = v_kind and created_at > v_now - v_window;
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;
  insert into public.ai_usage(user_id, kind, created_at) values(v_user, v_kind, v_now);
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.take_tracy_slot(text) from public, anon;
grant execute on function public.take_tracy_slot(text) to authenticated;
