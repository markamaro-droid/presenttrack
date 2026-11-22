-- Test billing only. No existing accounts, quotas or access policies are changed.
begin;
create table if not exists public.billing_test_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 trial_started_at timestamptz,
 trial_ends_at timestamptz,
 paid_until timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.billing_test_orders (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan text not null check(plan in ('weekly','monthly','annual')),
 amount integer not null check(amount>=2000),
 currency text not null default 'PHP' check(currency='PHP'),
 session_id text unique,
 checkout_url text,
 status text not null default 'pending' check(status in ('pending','paid')),
 paid_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.billing_test_accounts enable row level security;
alter table public.billing_test_orders enable row level security;
revoke all on public.billing_test_accounts,public.billing_test_orders from public,anon,authenticated;
grant all on public.billing_test_accounts,public.billing_test_orders to service_role;

create or replace function public.start_billing_test_trial(p_user uuid)
returns public.billing_test_accounts language plpgsql security definer set search_path='' as $$
declare a public.billing_test_accounts;
begin
 insert into public.billing_test_accounts(user_id,trial_started_at,trial_ends_at)
 values(p_user,now(),now()+interval '7 days')
 on conflict(user_id) do update set
 trial_started_at=coalesce(public.billing_test_accounts.trial_started_at,excluded.trial_started_at),
 trial_ends_at=coalesce(public.billing_test_accounts.trial_ends_at,excluded.trial_ends_at)
 returning * into a;
 return a;
end; $$;

create or replace function public.complete_billing_test_order(p_order uuid,p_session text,p_amount integer)
returns void language plpgsql security definer set search_path='' as $$
declare o public.billing_test_orders; a public.billing_test_accounts; expiry timestamptz;
begin
 select * into o from public.billing_test_orders where id=p_order for update;
 if not found or o.amount<>p_amount or (o.session_id is not null and o.session_id<>p_session) then
  raise exception 'billing_order_mismatch'; end if;
 if o.status='paid' then return; end if;
 insert into public.billing_test_accounts(user_id) values(o.user_id) on conflict do nothing;
 select * into a from public.billing_test_accounts where user_id=o.user_id for update;
 expiry:=greatest(now(),a.paid_until,a.trial_ends_at);
 expiry:=expiry+case o.plan when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '1 year' end;
 update public.billing_test_accounts set paid_until=expiry,updated_at=now() where user_id=o.user_id;
 update public.billing_test_orders set status='paid',session_id=p_session,paid_at=now() where id=o.id;
end; $$;
revoke all on function public.start_billing_test_trial(uuid),public.complete_billing_test_order(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.start_billing_test_trial(uuid),public.complete_billing_test_order(uuid,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
