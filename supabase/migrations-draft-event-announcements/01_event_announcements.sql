-- 01_event_announcements.sql
-- DRAFT ONLY. Do not execute.
--
-- Public announcement bar per event. Customer-facing text shown across
-- /live/$subdomain pages. Never contains PII; never references visitor,
-- billing, or admin data.
--
-- Ownership columns follow docs/DATABASE_RULES.md: both agency_id and
-- event_id present for tenant isolation, reporting, and debugging.
--
-- RLS posture:
--   * default deny (restrictive policy)
--   * platform_admin: full manage
--   * agency_owner / agency_admin / agency_staff_with_manage: manage rows
--     for events in their agency (writes gated to admin roles; staff read)
--   * public (anon/authenticated) NEVER reads this table directly — the
--     public-safe RPC in 02 is the only public surface

begin;

create table if not exists public.event_announcements (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  event_id     uuid not null,
  title        text not null check (length(title)   between 1 and 200),
  message      text not null check (length(message) between 1 and 1000),
  tone         text not null default 'info'
                 check (tone in ('info','success','warning','urgent')),
  link_label   text     check (link_label is null or length(link_label) between 1 and 80),
  link_url     text     check (link_url   is null or link_url ~ '^https?://'),
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint event_announcements_event_fk
    foreign key (event_id) references public.events(id) on delete cascade,
  -- Composite FK to (agency_id,id) on events ensures agency_id matches the event.
  constraint event_announcements_event_agency_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  constraint event_announcements_window_ck
    check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists idx_event_announcements_event_active
  on public.event_announcements (event_id, is_active);
create index if not exists idx_event_announcements_window
  on public.event_announcements (event_id, starts_at, ends_at)
  where is_active = true;

drop trigger if exists set_updated_at on public.event_announcements;
create trigger set_updated_at
  before update on public.event_announcements
  for each row execute function public.tg_set_updated_at();

-- Grants (required by docs/PUBLIC_SCHEMA_GRANTS rules). No anon grant:
-- public access is via SECURITY DEFINER RPC only.
grant select, insert, update, delete on public.event_announcements to authenticated;
grant all on public.event_announcements to service_role;

alter table public.event_announcements enable row level security;

-- Default deny.
drop policy if exists deny_all on public.event_announcements;
create policy deny_all on public.event_announcements
  as restrictive for all to public using (false) with check (false);

-- Platform admins: full access.
drop policy if exists platform_admin_all on public.event_announcements;
create policy platform_admin_all on public.event_announcements
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Agency admins (owner + admin): manage rows in their agency's events.
drop policy if exists agency_admin_manage on public.event_announcements;
create policy agency_admin_manage on public.event_announcements
  for all to authenticated
  using (public.is_agency_admin(auth.uid(), agency_id))
  with check (public.is_agency_admin(auth.uid(), agency_id));

-- Agency staff (any accepted agency member): read-only.
drop policy if exists agency_member_read on public.event_announcements;
create policy agency_member_read on public.event_announcements
  for select to authenticated
  using (public.is_agency_member(auth.uid(), agency_id));

commit;

-- Rollback:
--   drop table if exists public.event_announcements cascade;
