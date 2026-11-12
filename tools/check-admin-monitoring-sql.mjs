// Runs PostgreSQL in memory; never connects to the configured Supabase project.
// Install @electric-sql/pglite in %TEMP%/presenttrack-admin-sql-check first,
// or set PGLITE_MODULE to the installed package's dist/index.js file.
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const modulePath = process.env.PGLITE_MODULE || path.join(tmpdir(),'presenttrack-admin-sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
 create table public.user_data(user_id uuid primary key,data jsonb,initial_assessment_completed boolean);
 create table public.presentation_library(id integer,published boolean,source text);
 create table public.ai_usage(kind text,created_at timestamptz default now());
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,last_sign_in_at) values
 ('10000000-0000-4000-8000-000000000001','owner@example.com','{"role":"admin"}','{"full_name":"Owner"}',now(),now()),
 ('10000000-0000-4000-8000-000000000002','student@example.com','{}','{"full_name":"Student"}',now(),now()),
 ('10000000-0000-4000-8000-000000000003','pending@example.com','{}','{}',null,null);
 insert into auth.users(id,is_anonymous) values ('10000000-0000-4000-8000-000000000004',true);
 insert into public.user_data values
 ('10000000-0000-4000-8000-000000000002','{"pres":[{},{}],"ses":[{"source":"recorded-audio","analysis":{"transcript":"PRIVATE TRANSCRIPT"}},{"source":"recorded-evaluation","assess":true,"analysis":{}},{"score":90}]}',true),
 ('10000000-0000-4000-8000-000000000003','{"pres":null,"ses":"malformed legacy value"}',false);
 insert into public.presentation_library values (1,true,'builtin'),(2,false,'upload');
 insert into public.ai_usage(kind) values ('practice_analysis'),('robot_chat'),('tracy_speech');
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261111_admin_monitoring.sql',import.meta.url),'utf8'));
 async function overview(page=1,query='',filter='all') {
  return (await db.query('select public.admin_system_overview($1,$2,$3) as result',[page,query,filter])).rows[0].result;
 }
 await db.exec('set role service_role');
 const data=await overview();
 assert.deepEqual(data.summary,{users:3,students:2,admins:1,newUsers7d:3,signedIn7d:2,evaluatedStudents:1,pendingStudents:1,presentations:2,practiceReports:1});
 assert.deepEqual(data.library,{total:2,published:1,drafts:1,uploaded:1});
 assert.deepEqual(data.usage24h,{recordingAttempts:1,chatRequests:1,voiceRequests:1});
 assert.equal(data.registrations.length,7);assert.equal(data.registrations.reduce((n,d)=>n+d.users,0),3);
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE TRANSCRIPT|raw_app_meta_data|raw_user_meta_data/);
 assert.equal((await overview(1,'STUDENT')).users[0].email,'student@example.com');
 assert.equal((await overview(1,'','pending')).pagination.total,1);
 assert.equal((await overview(1,'','completed')).pagination.total,1);
 assert.equal((await overview(1,'','admin')).pagination.total,1);
 assert.equal((await overview(1,"' OR true --")).pagination.total,0);
 await assert.rejects(overview(1,'','invalid'),/invalid_filter/);
 await db.exec('reset role');
 await db.exec(`insert into auth.users(id,email,raw_app_meta_data) select gen_random_uuid(),'test'||n||'@example.com','{}' from generate_series(1,28) n`);
 const first=await overview(1),second=await overview(2);
 assert.equal(first.pagination.total,31);assert.equal(first.users.length,25);assert.equal(second.users.length,6);
 assert.equal(new Set([...first.users,...second.users].map(u=>u.id)).size,31);
 for(const role of ['authenticated','anon']) {
  await db.exec('set role '+role);await assert.rejects(overview(),/permission denied/);await db.exec('reset role');
 }
 console.log('Passed: monitoring migration executes in PostgreSQL; totals, malformed legacy data, private-field exclusion, search, filters, pagination and service-role-only access.');
} finally { await db.close(); }
