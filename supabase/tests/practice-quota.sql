-- OPTIONAL VERIFICATION, NOT A MIGRATION. Run on a test/staging project in SQL Editor.
-- Uses two existing non-anonymous users. Every data change is rolled back.
begin;
do $$
declare
  a uuid; u uuid; ids uuid[];
  result jsonb; i integer;
begin
  if has_function_privilege('anon', 'public.take_practice_slot()', 'EXECUTE') then
    raise exception 'FAIL: anon can execute quota function';
  end if;
  if not has_function_privilege('authenticated', 'public.take_practice_slot()', 'EXECUTE') then
    raise exception 'FAIL: authenticated cannot execute quota function';
  end if;
  select array_agg(id order by id) into ids from
    (select id from auth.users where not coalesce(is_anonymous, false) order by id limit 2) picked;
  if coalesce(array_length(ids, 1), 0) < 2 then
    raise exception 'Create two test accounts first; this test does not create accounts';
  end if;
  a := ids[1];
  foreach u in array ids loop
    perform pg_advisory_xact_lock(hashtextextended('practice_analysis:' || u::text, 0));
  end loop;
  delete from public.ai_usage where user_id = any(ids) and kind = 'practice_analysis';
  -- Exhausted conversation slots must not consume practice slots.
  insert into public.ai_usage(user_id, kind) select a, 'tracy_voice' from generate_series(1, 12);
  foreach u in array ids loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated', 'is_anonymous', false)::text, true);
    for i in 1..3 loop
      result := public.take_practice_slot();
      if not (result->>'allowed')::boolean then raise exception 'FAIL: independent user allowance'; end if;
    end loop;
    result := public.take_practice_slot();
    if (result->>'allowed')::boolean or (result->>'retry_after')::integer < 1 then raise exception 'FAIL: minute quota'; end if;
  end loop;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  delete from public.ai_usage where user_id = a and kind = 'practice_analysis';
  insert into public.ai_usage(user_id, kind, created_at)
    select a, 'practice_analysis', clock_timestamp() - interval '2 minutes' from generate_series(1, 20);
  if (public.take_practice_slot()->>'allowed')::boolean then raise exception 'FAIL: hourly quota'; end if;
  delete from public.ai_usage where user_id = a and kind = 'practice_analysis';
  insert into public.ai_usage(user_id, kind, created_at)
    select a, 'practice_analysis', clock_timestamp() - interval '2 hours' from generate_series(1, 60);
  if (public.take_practice_slot()->>'allowed')::boolean then raise exception 'FAIL: daily quota'; end if;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.take_practice_slot();
    raise exception 'FAIL: missing identity accepted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: grants, identity, independent users, minute/hour/day quotas. Rolling back all test data.';
end;
$$;
rollback;
