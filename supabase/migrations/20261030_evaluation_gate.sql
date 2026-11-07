-- Run after 20261028_initial_assessment.sql in the Supabase SQL Editor.
begin;

-- Direct client writes remain unable to change assessment completion fields.
-- SECURITY DEFINER functions run as their owner; auth.role() still contains the
-- caller's JWT role, so it cannot distinguish an authorized RPC from a direct write.
create or replace function public.protect_assessment_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.initial_assessment_completed := false;
      new.initial_assessment_presentation_id := null;
      new.initial_assessment_completed_at := null;
      new.created_at := now();
    else
      new.initial_assessment_completed := old.initial_assessment_completed;
      new.initial_assessment_presentation_id := old.initial_assessment_presentation_id;
      new.initial_assessment_completed_at := old.initial_assessment_completed_at;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.complete_browser_evaluation(p_results jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_results jsonb;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_results is null or octet_length(p_results::text) > 100000
     or jsonb_typeof(p_results) <> 'object'
     or p_results->>'source' is distinct from 'browser-speech-recognition'
     or coalesce(p_results->>'classification', '') not in ('proficient','developing','needs_improvement')
     or coalesce(p_results#>>'{quality,level}', '') not in ('ok','low')
     or jsonb_typeof(p_results->'metrics') is distinct from 'object'
     or jsonb_typeof(p_results#>'{metrics,totalDurationSec}') is distinct from 'number'
     or jsonb_typeof(p_results#>'{metrics,words}') is distinct from 'number'
     or jsonb_typeof(p_results->'score') is distinct from 'number'
     or jsonb_typeof(p_results->'feedback') is distinct from 'object' then
    raise exception 'invalid_evaluation' using errcode = '22023';
  end if;
  if (p_results#>>'{metrics,totalDurationSec}')::numeric not between 20 and 600
     or (p_results#>>'{metrics,words}')::numeric not between 1 and 10000
     or (p_results->>'score')::numeric not between 0 and 100 then
    raise exception 'invalid_evaluation' using errcode = '22023';
  end if;

  -- These are browser-estimated coaching metrics, not server-verified audio scores.
  -- Save the baseline and unlock flag together; never touch uploads or their quotas.
  v_results := jsonb_set(p_results, '{created_at}', to_jsonb(v_now));
  insert into public.user_data(user_id, data, initial_assessment_completed,
                               initial_assessment_completed_at, updated_at)
  values (v_user, jsonb_build_object('ev', jsonb_build_object(
    'done', true, 'at', v_now, 'results', v_results)), true, v_now, v_now)
  on conflict (user_id) do update set
    data = jsonb_set(coalesce(public.user_data.data, '{}'::jsonb), '{ev}',
      jsonb_build_object('done', true, 'at', v_now, 'results', v_results)),
    initial_assessment_completed = true,
    initial_assessment_completed_at = coalesce(public.user_data.initial_assessment_completed_at, v_now),
    updated_at = v_now;
end;
$$;

revoke all on function public.complete_browser_evaluation(jsonb) from public, anon;
grant execute on function public.complete_browser_evaluation(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Verify after running: this must return a function signature, not NULL.
select to_regprocedure('public.complete_browser_evaluation(jsonb)') as evaluation_function;
