-- Admin monitoring returns counts and account summaries, never private transcripts.
-- Only the server service role can execute it; /api/admin verifies the caller first.
begin;
create or replace function public.admin_system_overview(p_page integer default 1, p_query text default '', p_filter text default 'all')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_page integer := greatest(1,least(coalesce(p_page,1),100000));
  v_query text := lower(left(trim(coalesce(p_query,'')),120));
  v_filter text := coalesce(p_filter,'all');
  v_total integer; v_summary jsonb; v_users jsonb; v_library jsonb; v_activity jsonb; v_usage jsonb;
begin
  if v_filter not in ('all','student','admin','completed','pending') then
    raise exception 'invalid_filter' using errcode='22023';
  end if;
  with accounts as (
    select u.id, u.created_at, u.last_sign_in_at,
      coalesce(u.raw_app_meta_data->>'role','student')='admin' as admin,
      coalesce(d.initial_assessment_completed,false) as evaluated,
      case when jsonb_typeof(d.data->'pres')='array' then jsonb_array_length(d.data->'pres') else 0 end as presentations,
      (select count(*) from jsonb_array_elements(case when jsonb_typeof(d.data->'ses')='array' then d.data->'ses' else '[]'::jsonb end) s
        where s->>'source'='recorded-audio' and jsonb_typeof(s->'analysis')='object' and coalesce(s->>'assess','false')<>'true') as reports
    from auth.users u left join public.user_data d on d.user_id=u.id where not coalesce(u.is_anonymous,false)
  ) select jsonb_build_object('users',count(*),'students',count(*) filter(where not admin),'admins',count(*) filter(where admin),
      'newUsers7d',count(*) filter(where created_at>=now()-interval '7 days'),
      'signedIn7d',count(*) filter(where last_sign_in_at>=now()-interval '7 days'),
      'evaluatedStudents',count(*) filter(where not admin and evaluated),
      'pendingStudents',count(*) filter(where not admin and not evaluated),
      'presentations',coalesce(sum(presentations),0),'practiceReports',coalesce(sum(reports),0)) into v_summary from accounts;

  select jsonb_build_object('total',count(*),'published',count(*) filter(where published),
    'drafts',count(*) filter(where not published),'uploaded',count(*) filter(where source='upload')) into v_library from public.presentation_library;

  with days as (select generate_series(((now() at time zone 'UTC')::date-6)::timestamp, (now() at time zone 'UTC')::date::timestamp, interval '1 day')::date as day),
  daily as (select days.day,count(u.id) as count from days left join auth.users u on (u.created_at at time zone 'UTC')::date=days.day and not coalesce(u.is_anonymous,false) group by days.day)
  select jsonb_agg(jsonb_build_object('date',day,'users',count) order by day) into v_activity from daily;
  select jsonb_build_object('recordingAttempts',count(*) filter(where kind='practice_analysis'),
    'chatRequests',count(*) filter(where kind='robot_chat'),'voiceRequests',count(*) filter(where kind in ('tracy_voice','tracy_speech')))
    into v_usage from public.ai_usage where created_at>=now()-interval '24 hours';

  with matching as (
    select u.id,u.email,left(coalesce(u.raw_user_meta_data->>'full_name',''),80) as name,u.created_at,u.last_sign_in_at,
      case when u.raw_app_meta_data->>'role'='admin' then 'admin' else 'student' end as role,
      case when u.banned_until>now() then 'suspended' when u.email_confirmed_at is null then 'unconfirmed' else 'confirmed' end as status,
      coalesce(d.initial_assessment_completed,false) as evaluated,
      case when jsonb_typeof(d.data->'pres')='array' then jsonb_array_length(d.data->'pres') else 0 end as presentations,
      (select count(*) from jsonb_array_elements(case when jsonb_typeof(d.data->'ses')='array' then d.data->'ses' else '[]'::jsonb end) s
        where s->>'source'='recorded-audio' and jsonb_typeof(s->'analysis')='object' and coalesce(s->>'assess','false')<>'true') as reports
    from auth.users u left join public.user_data d on d.user_id=u.id
    where not coalesce(u.is_anonymous,false)
      and (v_query='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(u.raw_user_meta_data->>'full_name','')),v_query)>0)
      and (v_filter='all'
        or (v_filter='admin' and u.raw_app_meta_data->>'role'='admin')
        or (v_filter='student' and coalesce(u.raw_app_meta_data->>'role','')<>'admin')
        or (v_filter in ('completed','pending') and coalesce(u.raw_app_meta_data->>'role','')<>'admin' and coalesce(d.initial_assessment_completed,false)=(v_filter='completed')))
  ), selected as (select * from matching order by created_at desc,id limit 25 offset (v_page-1)*25)
  select (select count(*) from matching),coalesce((select jsonb_agg(to_jsonb(selected) order by created_at desc,id) from selected),'[]'::jsonb) into v_total,v_users;
  return jsonb_build_object('generatedAt',now(),'summary',v_summary,'library',v_library,'registrations',v_activity,'usage24h',v_usage,
    'users',v_users,'pagination',jsonb_build_object('page',v_page,'pageSize',25,'total',v_total));
end;
$$;
revoke all on function public.admin_system_overview(integer,text,text) from public, anon, authenticated;
grant execute on function public.admin_system_overview(integer,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
