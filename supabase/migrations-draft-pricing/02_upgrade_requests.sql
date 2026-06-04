-- GetStampd upgrade requests (DRAFT)
-- Additive, idempotent. Customer-facing plan upgrade request flow.
-- Apply manually only. Does not change billing or agency_subscriptions.

-- ---------------------------------------------------------------------------
-- public.upgrade_requests
-- ---------------------------------------------------------------------------
create table if not exists public.upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  requested_plan_code text not null,
  requested_plan_name text not null,
  contact_name text,
  contact_email text,
  message text,
  status text not null default 'new',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upgrade_requests_agency_id_idx
  on public.upgrade_requests (agency_id);
create index if not exists upgrade_requests_status_idx
  on public.upgrade_requests (status);
create index if not exists upgrade_requests_created_at_desc_idx
  on public.upgrade_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- Data API grants
-- upgrade_requests is auth-only; do NOT grant anon access.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.upgrade_requests to authenticated;
grant all on public.upgrade_requests to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Uses existing helpers from 24_helpers.sql:
--   public.is_platform_admin(uuid)
--   public.is_agency_admin(uuid, uuid)   -- owner OR admin
-- ---------------------------------------------------------------------------
alter table public.upgrade_requests enable row level security;

drop policy if exists upgrade_requests_insert_agency_admin on public.upgrade_requests;
create policy upgrade_requests_insert_agency_admin
  on public.upgrade_requests
  for insert
  to authenticated
  with check (
    public.is_agency_admin(auth.uid(), agency_id)
    or public.is_platform_admin(auth.uid())
  );

drop policy if exists upgrade_requests_select_agency_admin on public.upgrade_requests;
create policy upgrade_requests_select_agency_admin
  on public.upgrade_requests
  for select
  to authenticated
  using (
    public.is_agency_admin(auth.uid(), agency_id)
    or public.is_platform_admin(auth.uid())
  );

drop policy if exists upgrade_requests_update_platform_admin on public.upgrade_requests;
create policy upgrade_requests_update_platform_admin
  on public.upgrade_requests
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));
