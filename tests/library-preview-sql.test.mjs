import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('library previews share one private queue job, require admin consent and clean up without deleting student copies', async () => {
  const db = new PGlite(), admin = '11111111-1111-4111-8111-111111111111', student = '22222222-2222-4222-8222-222222222222', library = '33333333-3333-4333-8333-333333333333';
  const prepare = (user, consent) => db.query('select * from public.library_preview_prepare($1,$2,$3)', [library, user, consent]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,is_anonymous boolean default false,raw_app_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.user_data(user_id uuid primary key,initial_assessment_completed boolean);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant all on storage.objects to authenticated,service_role;
      insert into auth.users(id,raw_app_meta_data) values('${admin}','{"role":"admin","must_change_password":false}'),('${student}','{"role":"student"}');`);
    for (const file of ['20261110_presentation_library.sql', '20261117_presentation_conversion.sql', '20261118_cloudconvert.sql', '20261120_library_previews.sql']) await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    await db.query(`insert into public.presentation_library(id,title,source,file_path,file_name,file_size,context) values($1,'Lesson','upload',$2,'lesson.pptx',100,'{}')`, [library, library + '/presentation.pptx']);
    await assert.rejects(prepare(student, true), /administrator_required/);
    await assert.rejects(prepare(admin, false), /conversion_consent_required/);
    const p = (await prepare(admin, true)).rows[0];
    assert.equal(p.library_entry_id, library); assert.equal(p.user_id, admin); assert.equal(p.upload_completed, false);
    assert.ok(p.conversion_consent_at); assert.equal((await prepare(admin, true)).rows[0].id, p.id);
    assert.equal((await db.query('select count(*) from public.presentations')).rows[0].count, 1);
    await assert.rejects(db.query('select public.library_preview_submit($1)', [p.id]), /upload_incomplete/);
    await db.query("insert into storage.objects values('presentation-originals',$1,'{\"size\":100}')", [p.original_file_path]);
    const submitted = (await db.query('select * from public.library_preview_submit($1)', [p.id])).rows[0]; assert.equal(submitted.upload_completed, true);
    await db.query(`insert into public.presentations(id,user_id,title,original_filename,original_file_path,file_type,file_size) values($1,$2,'Student copy','copy.pptx',$3,'pptx',100)`, [library, student, student + '/' + library + '.pptx']);
    await db.exec('set role authenticated');
    await assert.rejects(prepare(admin, true), /permission denied/);
    await assert.rejects(db.query('select public.library_preview_submit($1)', [p.id]), /permission denied/);
    await db.exec('reset role');
    await db.query('delete from public.presentation_library where id=$1', [library]);
    const rows = (await db.query('select id,deleted_at from public.presentations')).rows;
    assert.ok(rows.find(r => r.id === p.id).deleted_at);
    assert.equal(rows.find(r => r.id === library).deleted_at, null);
    assert.equal(rows.length, 2, 'Cleanup tombstone is durable and the student copy remains');
    await assert.rejects(db.query('select public.library_preview_submit($1)', [p.id]), /library_not_found/);
    await db.exec(await readFile(new URL('../supabase/migrations/20261120_library_previews.sql', import.meta.url), 'utf8'));
  } finally { await db.close(); }
});
