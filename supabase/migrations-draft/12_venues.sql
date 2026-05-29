-- 12_venues.sql
-- Draft only. Do not execute.

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  order_index int not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint venues_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  -- Composite uniqueness for tenant-scoped composite FKs from descendants.
  constraint venues_tenant_unique unique (agency_id, event_id, id)
);

create index if not exists idx_venues_event_status on public.venues (event_id, status);
create index if not exists idx_venues_agency on public.venues (agency_id);
create index if not exists idx_venues_event_order on public.venues (event_id, order_index);

drop trigger if exists set_updated_at on public.venues;
create trigger set_updated_at
  before update on public.venues
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.venues to authenticated;
grant all on public.venues to service_role;

alter table public.venues enable row level security;

drop policy if exists deny_all on public.venues;
create policy deny_all on public.venues as restrictive for all to public using (false) with check (false);
