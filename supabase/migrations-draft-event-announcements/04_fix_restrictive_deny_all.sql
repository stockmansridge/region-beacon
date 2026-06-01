-- 04_fix_restrictive_deny_all.sql
-- DRAFT ONLY. Do not execute without approval.
--
-- Root cause of "new row violates row-level security policy 'deny_all'
-- for table event_announcements":
--
-- Migration 01 created deny_all as a RESTRICTIVE policy:
--   create policy deny_all on public.event_announcements
--     as restrictive for all to public using (false) with check (false);
--
-- In Postgres RLS, restrictive policies are AND-combined with permissive
-- policies. A restrictive policy that always evaluates to false therefore
-- blocks every read AND write, regardless of which permissive policies
-- (platform_admin_all, agency_admin_manage, agency_member_read) also match.
--
-- The correct posture is "default deny via absence of permissive policy".
-- We simply drop the restrictive deny_all. The remaining permissive
-- policies already restrict access to:
--   * platform_admin_all       -> platform admins (full manage)
--   * agency_admin_manage      -> agency owner/admin (manage rows in their agency's events)
--   * agency_member_read       -> any accepted agency member (read-only)
--
-- Public reads continue to flow through the SECURITY DEFINER RPC
-- public.get_public_event_announcements_by_domain (migration 02). No
-- anon SELECT/INSERT/UPDATE/DELETE is granted on the table itself.
--
-- This migration does NOT touch data, columns, indexes, the RPC, or grants.

begin;

drop policy if exists deny_all on public.event_announcements;

-- (Re-assert the three intended permissive policies idempotently, in case
-- a partial earlier rollout removed any of them.)

drop policy if exists platform_admin_all on public.event_announcements;
create policy platform_admin_all on public.event_announcements
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists agency_admin_manage on public.event_announcements;
create policy agency_admin_manage on public.event_announcements
  for all to authenticated
  using (public.is_agency_admin(auth.uid(), agency_id))
  with check (public.is_agency_admin(auth.uid(), agency_id));

drop policy if exists agency_member_read on public.event_announcements;
create policy agency_member_read on public.event_announcements
  for select to authenticated
  using (public.is_agency_member(auth.uid(), agency_id));

commit;

-- Rollback:
--   begin;
--   create policy deny_all on public.event_announcements
--     as restrictive for all to public using (false) with check (false);
--   commit;
-- (Not recommended — restores the broken state.)
