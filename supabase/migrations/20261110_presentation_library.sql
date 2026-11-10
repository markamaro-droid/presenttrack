-- Run after the existing account/storage migrations. No existing user data is changed.
begin;
create or replace function public.is_library_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid()
    and raw_app_meta_data->>'role' = 'admin'
    and raw_app_meta_data->>'must_change_password' = 'false');
$$;
revoke all on function public.is_library_admin() from public, anon;
grant execute on function public.is_library_admin() to authenticated;

create table if not exists public.presentation_library (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'General' check (char_length(category) between 1 and 40),
  target_seconds integer not null default 180 check (target_seconds between 60 and 600),
  source text not null check (source in ('builtin','upload')),
  file_path text not null,
  file_name text not null check (file_name ~* '\.(pptx|pdf)$'),
  file_size integer not null check (file_size between 1 and 50000000),
  preview_path text,
  context jsonb not null check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 150000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint library_path check (
    (source = 'builtin' and file_path ~ '^assets/library/[a-z0-9-]+\.(pptx|pdf)$'
      and (preview_path is null or preview_path ~ '^assets/library/[a-z0-9-]+\.pdf$'))
    or (source = 'upload' and file_path ~ ('^' || id::text || '/[a-zA-Z0-9_-]+\.(pptx|pdf)$') and preview_path is null)
  )
);
alter table public.presentation_library enable row level security;
revoke all on public.presentation_library from anon, authenticated;
grant select, insert, update on public.presentation_library to authenticated;
drop policy if exists library_read on public.presentation_library;
create policy library_read on public.presentation_library for select to authenticated
  using (published or (select public.is_library_admin()));
drop policy if exists library_add on public.presentation_library;
create policy library_add on public.presentation_library for insert to authenticated
  with check ((select public.is_library_admin()));
drop policy if exists library_edit on public.presentation_library;
create policy library_edit on public.presentation_library for update to authenticated
  using ((select public.is_library_admin())) with check ((select public.is_library_admin()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('presentation-library', 'presentation-library', false, 50000000,
  array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;
drop policy if exists library_file_read on storage.objects;
create policy library_file_read on storage.objects for select to authenticated using (
  bucket_id = 'presentation-library' and ((select public.is_library_admin()) or exists (
    select 1 from public.presentation_library l where l.source = 'upload' and l.file_path = name and l.published))
);
drop policy if exists library_file_add on storage.objects;
create policy library_file_add on storage.objects for insert to authenticated with check (
  bucket_id = 'presentation-library' and (select public.is_library_admin())
  and name ~ '^[a-f0-9-]{36}/[a-zA-Z0-9_-]+\.(pptx|pdf)$'
);
-- Allows cleanup of an upload if publishing its catalog entry failed.
drop policy if exists library_file_cleanup on storage.objects;
create policy library_file_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'presentation-library' and (select public.is_library_admin())
  and not exists(select 1 from public.presentation_library l where l.file_path = name)
);
notify pgrst, 'reload schema';
commit;
