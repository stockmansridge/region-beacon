-- Repair an already-applied Event Page Views migration.
--
-- The original restrictive deny_all policy made every SELECT fail RLS even
-- when agency_member_read or platform_admin_all matched. RLS remains default
-- deny after this policy is removed: only the explicit policies below grant
-- authenticated access, and anonymous visitors still write solely through
-- the SECURITY DEFINER record_event_page_view RPC.

begin;

drop policy if exists deny_all on public.event_page_views;

grant select on public.event_page_views to authenticated;
grant all on public.event_page_views to service_role;

drop policy if exists platform_admin_all on public.event_page_views;
create policy platform_admin_all on public.event_page_views
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists agency_member_read on public.event_page_views;
create policy agency_member_read on public.event_page_views
  for select to authenticated
  using (public.is_agency_member(auth.uid(), agency_id));

notify pgrst, 'reload schema';

commit;