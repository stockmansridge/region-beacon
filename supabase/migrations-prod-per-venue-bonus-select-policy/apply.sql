-- Fix: per-venue bonus rows insert successfully but are invisible to the
-- agency admin that just saved them, because the SELECT policy on
-- public.event_bonus_code_venues only allowed platform_admin OR
-- agency_member. Agency admins are not necessarily stored as members
-- on this project, so their own writes were hidden from their own reads.
--
-- Safe to re-run. Apply in the Supabase SQL editor.

begin;

drop policy if exists event_bonus_code_venues_select on public.event_bonus_code_venues;
create policy event_bonus_code_venues_select
  on public.event_bonus_code_venues for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

commit;
