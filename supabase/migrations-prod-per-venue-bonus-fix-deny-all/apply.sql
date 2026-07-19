-- Fix: per-venue bonus venues never appear in the admin UI because a
-- RESTRICTIVE `deny_all` policy on public.event_bonus_code_venues is scoped
-- `to public`, which includes `authenticated`. Restrictive policies AND with
-- permissive ones, so every SELECT — even for platform/agency admins —
-- returns empty. The RPC writes succeed (SECURITY DEFINER bypasses RLS),
-- but the follow-up read shows 0 rows.
--
-- Scope the restrictive fallback to anon only, so the explicit permissive
-- SELECT/WRITE policies for authenticated actually take effect.
--
-- Safe to re-run. Apply in the Supabase SQL editor.

begin;

drop policy if exists deny_all on public.event_bonus_code_venues;
create policy deny_all on public.event_bonus_code_venues
  as restrictive for all to anon using (false) with check (false);

-- Re-assert the permissive policies in case an earlier partial apply left
-- them in an older shape.
drop policy if exists event_bonus_code_venues_select on public.event_bonus_code_venues;
create policy event_bonus_code_venues_select
  on public.event_bonus_code_venues for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

drop policy if exists event_bonus_code_venues_write on public.event_bonus_code_venues;
create policy event_bonus_code_venues_write
  on public.event_bonus_code_venues for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

commit;
