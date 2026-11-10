-- Apply after 20261030_evaluation_gate.sql. Existing account data is retained.
begin;

create or replace function public.complete_recorded_evaluation(p_results jsonb)
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
     or p_results->>'source' is distinct from 'recorded-evaluation'
     or coalesce(p_results->>'classification', '') not in ('proficient','developing','needs_improvement')
     or coalesce(p_results#>>'{quality,level}', '') not in ('ok','low')
     or jsonb_typeof(p_results->'metrics') is distinct from 'object'
     or jsonb_typeof(p_results#>'{metrics,totalDurationSec}') is distinct from 'number'
     or jsonb_typeof(p_results#>'{metrics,words}') is distinct from 'number'
     or jsonb_typeof(p_results->'score') is distinct from 'number'
     or jsonb_typeof(p_results->'feedback') is distinct from 'object'
     or p_results->>'version' is distinct from '3'
     or p_results#>>'{contentValidation,eligible}' is distinct from 'true'
     or p_results#>>'{contentValidation,referenceChecked}' is distinct from 'true'
     or p_results#>>'{metrics,pauseBasis}' is distinct from 'audio-word-timestamps'
     or p_results#>>'{metrics,fillerBasis}' is distinct from 'verbatim-audio-transcript'
     or p_results->>'deckId' is distinct from 'healthy-study-habits'
     or jsonb_typeof(p_results#>'{metrics,fillerCount}') is distinct from 'number'
     or jsonb_typeof(p_results#>'{metrics,pauseCount}') is distinct from 'number'
     or jsonb_typeof(p_results->'transcript') is distinct from 'string' then
    raise exception 'invalid_evaluation' using errcode = '22023';
  end if;
  if (p_results#>>'{metrics,totalDurationSec}')::numeric not between 90 and 302
     or (p_results#>>'{metrics,words}')::numeric not between 120 and 10000
     or (p_results->>'score')::numeric not between 0 and 100
     or (p_results#>>'{metrics,fillerCount}')::numeric < 0
     or (p_results#>>'{metrics,pauseCount}')::numeric < 0
     or char_length(p_results->>'transcript') < 100 then
    raise exception 'invalid_evaluation' using errcode = '22023';
  end if;

  -- The app submits the recorded-audio analysis returned by /api/practice.
  -- This RPC validates the result envelope; it does not independently re-transcribe audio.
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

revoke all on function public.complete_recorded_evaluation(jsonb) from public, anon;
grant execute on function public.complete_recorded_evaluation(jsonb) to authenticated;

-- Prevent the obsolete browser-only path from awarding new baselines.
revoke all on function public.complete_browser_evaluation(jsonb) from authenticated, anon;
notify pgrst, 'reload schema';
commit;

select to_regprocedure('public.complete_recorded_evaluation(jsonb)') as evaluation_function;
