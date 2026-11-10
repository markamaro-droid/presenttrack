-- Apply after 20261106_tracy_voice.sql. Independent recording-analysis budget.
begin;
create or replace function public.take_practice_slot()
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
  v_kind := 'practice_analysis'; v_min_limit := 3; v_hour_limit := 20; v_day_limit := 60;
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
revoke all on function public.take_practice_slot() from public, anon;
grant execute on function public.take_practice_slot() to authenticated;

notify pgrst, 'reload schema';
commit;
