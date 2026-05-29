-- 01_harden_event_asset_helper_grants.sql
-- DRAFT ONLY. Do not execute.
--
-- Hardens EXECUTE grants on the event-assets storage helper functions:
--   * public.event_assets_path_parts(text)
--   * public.can_write_event_asset(text)
--
-- Background
-- ----------
-- Earlier drafts granted EXECUTE to `anon` (and Postgres' default PUBLIC
-- pseudo-role retains EXECUTE on new functions unless revoked). Neither
-- function needs to be callable by unauthenticated sessions:
--
--   * `event_assets_path_parts` is a pure parser used only by
--     `can_write_event_asset` and by admin server code.
--   * `can_write_event_asset` is a SECURITY DEFINER write-gate consulted
--     by the storage.objects INSERT/UPDATE/DELETE policies. Storage RLS
--     evaluates the policy with the policy owner's privileges, not the
--     caller's, so revoking caller-side EXECUTE from anon/PUBLIC does
--     NOT break uploads performed by authenticated agency_owner /
--     agency_admin / platform_admin sessions.
--
-- Public READ of objects in the `event-assets` bucket is governed by the
-- separate `event_assets_public_read` policy on storage.objects, which
-- does not call either helper. Anon read access is unaffected.
--
-- Depends on:
--   * supabase/migrations-draft-event-assets-storage/01_event_assets_bucket.sql
--   * supabase/migrations-draft-venue-public-pages-storage/01_storage_policy_venue_assets.sql

begin;

-- 1) Revoke broad grants. PUBLIC is the implicit default pseudo-role;
--    anon is explicit because the prior draft granted it.
revoke all on function public.event_assets_path_parts(text) from public;
revoke all on function public.event_assets_path_parts(text) from anon;

revoke all on function public.can_write_event_asset(text)   from public;
revoke all on function public.can_write_event_asset(text)   from anon;

-- 2) Re-grant only what is needed.
grant execute on function public.event_assets_path_parts(text) to authenticated;
grant execute on function public.event_assets_path_parts(text) to service_role;

grant execute on function public.can_write_event_asset(text)   to authenticated;
grant execute on function public.can_write_event_asset(text)   to service_role;

commit;
