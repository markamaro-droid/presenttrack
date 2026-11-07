-- Apply after 20261106_tracy_voice.sql. Metadata only, no text or audio.
create or replace function public.take_tracy_speech_slot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise insufficient_privilege using message = 'authenticated account required';
  end if;
  -- One global lock makes both per-user and site-wide budgets atomic.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tracy_speech_budget', 0));
  v_now := clock_timestamp();
  if (select count(*) from public.ai_usage where kind = 'tracy_speech' and user_id = v_user and created_at > v_now - interval '1 minute') >= 12
    or (select count(*) from public.ai_usage where kind = 'tracy_speech' and user_id = v_user and created_at > v_now - interval '1 day') >= 120
    or (select count(*) from public.ai_usage where kind = 'tracy_speech' and created_at > v_now - interval '1 day') >= 2000 then
    return jsonb_build_object('allowed', false);
  end if;
  insert into public.ai_usage(user_id, kind, created_at) values(v_user, 'tracy_speech', v_now);
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.take_tracy_speech_slot() from public, anon;
grant execute on function public.take_tracy_speech_slot() to authenticated;
