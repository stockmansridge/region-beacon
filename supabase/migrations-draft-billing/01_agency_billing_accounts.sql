-- 01_agency_billing_accounts.sql
-- Draft only. Do not execute.
-- One billing account per agency. Stripe customer mapping lives here.

create table if not exists public.agency_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null unique,
  stripe_customer_id text unique,
  billing_email citext,
  billing_name text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agency_billing_accounts_agency_fk
    foreign key (agency_id) references public.agencies(id) on delete cascade
);

create index if not exists idx_agency_billing_accounts_agency
  on public.agency_billing_accounts (agency_id);

drop trigger if exists set_updated_at on public.agency_billing_accounts;
create trigger set_updated_at
  before update on public.agency_billing_accounts
  for each row execute function public.tg_set_updated_at();

grant select on public.agency_billing_accounts to authenticated;
grant all on public.agency_billing_accounts to service_role;

alter table public.agency_billing_accounts enable row level security;

drop policy if exists deny_all on public.agency_billing_accounts;
create policy deny_all on public.agency_billing_accounts
  as restrictive for all to public using (false) with check (false);
