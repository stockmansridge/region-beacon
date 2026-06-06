-- Tasting QR Codes: per-venue secondary QR codes that award extra points.
-- Draft only. Apply manually via the Lovable Cloud migration tool.
-- Additive; does not alter existing tables.

create table if not exists public.venue_tasting_qr_codes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  venue_id uuid not null,

  label text not null check (char_length(label) between 1 and 150),
  description text,

  points integer not null default 10 check (points >= 0 and points <= 10000),
  status text not null default 'active' check (status in ('active','disabled')),

  qr_token text not null unique,

  scan_limit_per_passport integer check (scan_limit_per_passport is null or scan_limit_per_passport >= 1),
  starts_at timestamptz,
  ends_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- Tenant-integrity composite FK matching public.venues (agency_id, event_id, id).
  constraint venue_tasting_qr_codes_venue_fk
    foreign key (agency_id, event_id, venue_id)
    references public.venues (agency_id, event_id, id) on delete cascade,

  constraint venue_tasting_qr_codes_window_ck
    check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists idx_venue_tasting_qr_codes_venue
  on public.venue_tasting_qr_codes (venue_id, status) where deleted_at is null;
create index if not exists idx_venue_tasting_qr_codes_event
  on public.venue_tasting_qr_codes (event_id) where deleted_at is null;

drop trigger if exists set_updated_at on public.venue_tasting_qr_codes;
create trigger set_updated_at
  before update on public.venue_tasting_qr_codes
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.venue_tasting_qr_codes to authenticated;
grant all on public.venue_tasting_qr_codes to service_role;

alter table public.venue_tasting_qr_codes enable row level security;

drop policy if exists deny_all on public.venue_tasting_qr_codes;
create policy deny_all on public.venue_tasting_qr_codes
  as restrictive for all to public using (false) with check (false);

drop policy if exists venue_tasting_qr_codes_select on public.venue_tasting_qr_codes;
create policy venue_tasting_qr_codes_select
  on public.venue_tasting_qr_codes for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

drop policy if exists venue_tasting_qr_codes_write on public.venue_tasting_qr_codes;
create policy venue_tasting_qr_codes_write
  on public.venue_tasting_qr_codes for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
