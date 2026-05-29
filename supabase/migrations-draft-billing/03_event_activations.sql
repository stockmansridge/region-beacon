-- 03_event_activations.sql
-- Draft only. Do not execute.
-- Controls whether an event is commercially activated and allowed to go live.
-- Composite FK (agency_id, event_id) -> events(agency_id, id) prevents
-- an activation row from drifting onto an event in a different agency.

create table if not exists public.event_activations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null unique,
  status text not null default 'unpaid'
    check (status in ('unpaid','active','past_due','cancelled','comp')),
  activation_kind text
    check (activation_kind is null
           or activation_kind in ('one_time','included_in_plan','comp')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_activations_event_fk
    foreign key (agency_id, event_id)
    references public.events (agency_id, id)
    on delete cascade
);

create index if not exists idx_event_activations_agency
  on public.event_activations (agency_id);

create index if not exists idx_event_activations_status
  on public.event_activations (agency_id, status);

drop trigger if exists set_updated_at on public.event_activations;
create trigger set_updated_at
  before update on public.event_activations
  for each row execute function public.tg_set_updated_at();

grant select on public.event_activations to authenticated;
grant all on public.event_activations to service_role;

alter table public.event_activations enable row level security;

drop policy if exists deny_all on public.event_activations;
create policy deny_all on public.event_activations
  as restrictive for all to public using (false) with check (false);
