-- Tasting QR claims ledger. One row per (tasting_qr, passport) by default.
-- Draft only.

create table if not exists public.venue_tasting_qr_claims (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  venue_id uuid not null,
  tasting_qr_id uuid not null references public.venue_tasting_qr_codes(id) on delete cascade,
  passport_id uuid not null,

  points_awarded integer not null default 0,
  claimed_at timestamptz not null default now(),

  -- Tenant integrity to passports (composite key, same shape as checkins).
  constraint venue_tasting_qr_claims_passport_fk
    foreign key (agency_id, event_id, passport_id)
    references public.passports (agency_id, event_id, id) on delete cascade,

  constraint venue_tasting_qr_claims_unique
    unique (tasting_qr_id, passport_id)
);

create index if not exists idx_venue_tasting_qr_claims_event
  on public.venue_tasting_qr_claims (event_id, claimed_at desc);
create index if not exists idx_venue_tasting_qr_claims_passport
  on public.venue_tasting_qr_claims (passport_id);
create index if not exists idx_venue_tasting_qr_claims_tasting_qr
  on public.venue_tasting_qr_claims (tasting_qr_id);

grant select on public.venue_tasting_qr_claims to authenticated;
grant all on public.venue_tasting_qr_claims to service_role;

alter table public.venue_tasting_qr_claims enable row level security;

drop policy if exists deny_all on public.venue_tasting_qr_claims;
create policy deny_all on public.venue_tasting_qr_claims
  as restrictive for all to public using (false) with check (false);

-- Read-only for admins / agency members. Writes go through the
-- SECURITY DEFINER claim RPC only.
drop policy if exists venue_tasting_qr_claims_select on public.venue_tasting_qr_claims;
create policy venue_tasting_qr_claims_select
  on public.venue_tasting_qr_claims for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );
