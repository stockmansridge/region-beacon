-- 02_agency_subscriptions.sql
-- Draft only. Do not execute.
-- Agency-level subscription history. One row per Stripe subscription.

create table if not exists public.agency_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  stripe_subscription_id text unique,
  plan_code text,
  status text not null default 'none'
    check (status in ('none','trialing','active','past_due','cancelled','incomplete','paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agency_subscriptions_agency_fk
    foreign key (agency_id) references public.agencies(id) on delete cascade
);

create index if not exists idx_agency_subscriptions_agency
  on public.agency_subscriptions (agency_id);

create index if not exists idx_agency_subscriptions_status
  on public.agency_subscriptions (agency_id, status);

-- At most one "live" (non-terminal) subscription per agency.
-- Terminal states (cancelled) are excluded so history is preserved.
create unique index if not exists uq_agency_subscriptions_live
  on public.agency_subscriptions (agency_id)
  where status in ('trialing','active','past_due','incomplete','paused');

drop trigger if exists set_updated_at on public.agency_subscriptions;
create trigger set_updated_at
  before update on public.agency_subscriptions
  for each row execute function public.tg_set_updated_at();

grant select on public.agency_subscriptions to authenticated;
grant all on public.agency_subscriptions to service_role;

alter table public.agency_subscriptions enable row level security;

drop policy if exists deny_all on public.agency_subscriptions;
create policy deny_all on public.agency_subscriptions
  as restrictive for all to public using (false) with check (false);
