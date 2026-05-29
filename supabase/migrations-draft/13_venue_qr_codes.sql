-- 13_venue_qr_codes.sql
-- Draft only. Do not execute.
-- Tokens are random, non-guessable, generated server-side (see step 34).
-- One active token per venue enforced by partial unique index.

create table if not exists public.venue_qr_codes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  venue_id uuid not null,
  token text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid,

  constraint venue_qr_codes_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint venue_qr_codes_venue_fk
    foreign key (agency_id, event_id, venue_id) references public.venues(agency_id, event_id, id) on delete cascade,
  -- Composite uniqueness for tenant-scoped composite FKs from checkins.
  constraint venue_qr_codes_tenant_unique unique (agency_id, event_id, id),
  constraint venue_qr_codes_token_unique unique (token),
  constraint venue_qr_codes_token_length check (length(token) >= 22)
);

create unique index if not exists ux_venue_qr_codes_one_active_per_venue
  on public.venue_qr_codes (venue_id) where status = 'active';

create index if not exists idx_venue_qr_codes_event on public.venue_qr_codes (event_id);

grant select, insert, update on public.venue_qr_codes to authenticated;
grant all on public.venue_qr_codes to service_role;

alter table public.venue_qr_codes enable row level security;

drop policy if exists deny_all on public.venue_qr_codes;
create policy deny_all on public.venue_qr_codes as restrictive for all to public using (false) with check (false);
