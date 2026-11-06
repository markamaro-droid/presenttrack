-- Requires ai_usage from 20261028_initial_assessment.sql. No conversation text is stored.
-- Serialize count + insert per user across all Vercel function instances.
create or replace function public.take_robot_chat_slot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_minute integer;
  v_hour integer;
  v_day integer;
  v_retry integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('robot_chat:' || p_user_id::text, 0));
  v_now := clock_timestamp();
  select count(*) filter (where created_at > v_now - interval '1 minute'),
         count(*) filter (where created_at > v_now - interval '1 hour'), count(*)
    into v_minute, v_hour, v_day
    from public.ai_usage
    where user_id = p_user_id and kind = 'robot_chat' and created_at > v_now - interval '1 day';
  if v_minute >= 5 or v_hour >= 30 or v_day >= 100 then
    select greatest(1, ceil(extract(epoch from (min(created_at) +
      case when v_day >= 100 then interval '1 day' when v_hour >= 30 then interval '1 hour' else interval '1 minute' end - v_now)))::integer)
      into v_retry from public.ai_usage
      where user_id = p_user_id and kind = 'robot_chat' and created_at > v_now -
        case when v_day >= 100 then interval '1 day' when v_hour >= 30 then interval '1 hour' else interval '1 minute' end;
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;
  insert into public.ai_usage(user_id, kind, created_at) values(p_user_id, 'robot_chat', v_now);
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.take_robot_chat_slot(uuid) from public, anon, authenticated;
grant execute on function public.take_robot_chat_slot(uuid) to service_role;
