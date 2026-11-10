-- OPTIONAL STAGING VERIFICATION, NOT A MIGRATION. Requires two existing users.
-- All changes, including temporary admin roles, are rolled back.
begin;
do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from (select id from auth.users where not coalesce(is_anonymous,false) order by id limit 2) u;
  if coalesce(array_length(ids,1),0) < 2 then raise exception 'Create two staging accounts first'; end if;
  perform set_config('test.library_admin',ids[1]::text,true);
  perform set_config('test.library_student',ids[2]::text,true);
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}') || '{"role":"admin","must_change_password":true}'::jsonb where id=ids[1];
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}') - 'role' where id=ids[2];
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[1],'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  if public.is_library_admin() then raise exception 'FAIL: default-password admin can publish'; end if;
end $$;
reset role;
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"must_change_password":false}'::jsonb
  where id=current_setting('test.library_admin')::uuid;
set local role authenticated;
do $$ begin
  if not public.is_library_admin() then raise exception 'FAIL: secured admin cannot publish'; end if;
  insert into public.presentation_library(id,title,source,file_path,file_name,file_size,context,published)
  values ('ffffffff-ffff-4fff-8fff-fffffffffff1','Access test draft','builtin','assets/library/test.pptx','test.pptx',100,'{}',false),
         ('ffffffff-ffff-4fff-8fff-fffffffffff2','Access test published','builtin','assets/library/test.pptx','test.pptx',100,'{}',true);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.library_student'),'role','authenticated','app_metadata',jsonb_build_object('role','admin','must_change_password',false))::text,true);
set local role authenticated;
do $$
declare changed integer;
begin
  if public.is_library_admin() then raise exception 'FAIL: forged claim grants admin'; end if;
  if exists(select 1 from public.presentation_library where id='ffffffff-ffff-4fff-8fff-fffffffffff1') then raise exception 'FAIL: student reads unpublished deck'; end if;
  if not exists(select 1 from public.presentation_library where id='ffffffff-ffff-4fff-8fff-fffffffffff2') then raise exception 'FAIL: student cannot read published deck'; end if;
  update public.presentation_library set title='Forged edit' where id='ffffffff-ffff-4fff-8fff-fffffffffff2';
  get diagnostics changed=row_count;
  if changed <> 0 then raise exception 'FAIL: student edits catalog'; end if;
  begin
    insert into public.presentation_library(title,source,file_path,file_name,file_size,context) values ('Forged draft','builtin','assets/library/test.pptx','test.pptx',100,'{}');
    raise exception 'FAIL: student inserts catalog entry';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values ('presentation-library','ffffffff-ffff-4fff-8fff-fffffffffff1/forged.pdf');
    raise exception 'FAIL: student uploads to shared library';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.presentation_library','SELECT') then raise exception 'FAIL: anonymous catalog grant'; end if;
  if has_function_privilege('anon','public.is_library_admin()','EXECUTE') then raise exception 'FAIL: anonymous admin grant'; end if;
  raise notice 'PASS: initial-password restriction, admin publishing, student isolation and forged-claim rejection. Rolling back.';
end $$;
rollback;
