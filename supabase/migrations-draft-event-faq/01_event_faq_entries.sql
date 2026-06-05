-- 01_event_faq_entries.sql
-- DRAFT ONLY. Do not execute until reviewed.
--
-- Per-event FAQ / Info entries. Customer-facing question/answer pairs
-- shown on the public /live/$subdomain/faq page. Never contains PII,
-- billing, or admin data.
--
-- Follows the same RLS posture as event_announcements:
--   * default deny (restrictive policy)
--   * platform_admin: full manage
--   * agency_admin (owner/admin): manage rows for their agency
--   * agency_member (staff): read-only
--   * public (anon/authenticated) NEVER reads this table directly — the
--     public-safe RPC in 02 is the only public surface

begin;

create table if not exists public.event_faq_entries (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  event_id     uuid not null,
  question     text not null check (length(question) between 1 and 500),
  answer       text not null check (length(answer)   between 1 and 5000),
  order_index  integer not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint event_faq_entries_event_fk
    foreign key (event_id) references public.events(id) on delete cascade,
  -- Composite FK to (agency_id,id) on events ensures agency_id matches the event.
  constraint event_faq_entries_event_agency_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade
);

create index if not exists idx_event_faq_entries_event_order
  on public.event_faq_entries (event_id, order_index, created_at);

drop trigger if exists set_updated_at on public.event_faq_entries;
create trigger set_updated_at
  before update on public.event_faq_entries
  for each row execute function public.tg_set_updated_at();

-- Grants. No anon grant: public access is via SECURITY DEFINER RPC only.
grant select, insert, update, delete on public.event_faq_entries to authenticated;
grant all on public.event_faq_entries to service_role;

alter table public.event_faq_entries enable row level security;

-- Default deny.
drop policy if exists deny_all on public.event_faq_entries;
create policy deny_all on public.event_faq_entries
  as restrictive for all to public using (false) with check (false);

-- Platform admins: full access.
drop policy if exists platform_admin_all on public.event_faq_entries;
create policy platform_admin_all on public.event_faq_entries
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Agency admins (owner + admin): manage rows in their agency's events.
drop policy if exists agency_admin_manage on public.event_faq_entries;
create policy agency_admin_manage on public.event_faq_entries
  for all to authenticated
  using (public.is_agency_admin(auth.uid(), agency_id))
  with check (public.is_agency_admin(auth.uid(), agency_id));

-- Agency staff (any accepted agency member): read-only.
drop policy if exists agency_member_read on public.event_faq_entries;
create policy agency_member_read on public.event_faq_entries
  for select to authenticated
  using (public.is_agency_member(auth.uid(), agency_id));

commit;

-- Rollback:
--   drop table if exists public.event_faq_entries cascade;
