-- 14_venue_offers.sql
-- Draft only. Do not execute.

create table if not exists public.venue_offers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  venue_id uuid not null,
  title text not null,
  description text,
  redemption_instructions text,
  offer_type text not null check (offer_type in ('discount','freebie','tasting','upgrade','other')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint venue_offers_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint venue_offers_venue_fk
    foreign key (agency_id, event_id, venue_id) references public.venues(agency_id, event_id, id) on delete cascade
);

create index if not exists idx_venue_offers_event_active on public.venue_offers (event_id, is_active);
create index if not exists idx_venue_offers_venue_active on public.venue_offers (venue_id, is_active);
create index if not exists idx_venue_offers_agency on public.venue_offers (agency_id);

drop trigger if exists set_updated_at on public.venue_offers;
create trigger set_updated_at
  before update on public.venue_offers
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.venue_offers to authenticated;
grant all on public.venue_offers to service_role;

alter table public.venue_offers enable row level security;

drop policy if exists deny_all on public.venue_offers;
create policy deny_all on public.venue_offers as restrictive for all to public using (false) with check (false);
