-- 04_billing_events.sql
-- Draft only. Do not execute.
-- Immutable billing audit log. Doubles as the Stripe webhook dedupe table
-- via the unique constraint on stripe_event_id.

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,
  event_id uuid,
  source text not null
    check (source in ('stripe_webhook','admin_action','system')),
  event_type text not null,
  stripe_event_id text unique,
  payload jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now(),

  constraint billing_events_agency_fk
    foreign key (agency_id) references public.agencies(id) on delete set null,
  constraint billing_events_event_fk
    foreign key (event_id) references public.events(id) on delete set null
);

create index if not exists idx_billing_events_agency_created
  on public.billing_events (agency_id, created_at desc);

create index if not exists idx_billing_events_event_created
  on public.billing_events (event_id, created_at desc);

create index if not exists idx_billing_events_type_created
  on public.billing_events (event_type, created_at desc);

-- No updated_at — this table is append-only.

grant select on public.billing_events to authenticated;
grant all on public.billing_events to service_role;

alter table public.billing_events enable row level security;

drop policy if exists deny_all on public.billing_events;
create policy deny_all on public.billing_events
  as restrictive for all to public using (false) with check (false);
