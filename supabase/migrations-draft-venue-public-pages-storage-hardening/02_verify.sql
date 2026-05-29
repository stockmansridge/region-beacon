-- 02_verify.sql
-- DRAFT ONLY. Read-only verification queries to run on staging after
-- applying 01_harden_event_asset_helper_grants.sql.

-- A) Final EXECUTE grants on the helpers. Expect rows ONLY for
--    `authenticated` and `service_role`. No PUBLIC, no anon.
select n.nspname            as schema,
       p.proname            as routine,
       pg_get_userbyid(g.grantee) as grantee,
       g.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g
where n.nspname = 'public'
  and p.proname in ('event_assets_path_parts','can_write_event_asset')
order by p.proname, grantee;

-- A.1) Same check via information_schema for cross-verification.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('event_assets_path_parts','can_write_event_asset')
order by routine_name, grantee;
-- Expect: only authenticated + service_role appear; PUBLIC/anon absent.

-- B) Anon must NOT be able to execute the helpers directly.
--    Run each block in its own transaction.
begin;
set local role anon;
-- Both of these should raise: permission denied for function ...
-- Run them one at a time and confirm the error.
-- select public.event_assets_path_parts('x');
-- select public.can_write_event_asset('x');
rollback;

-- C) Authenticated callers can still execute the helpers (they're invoked
--    by storage RLS during uploads).
begin;
set local role authenticated;
select * from public.event_assets_path_parts(
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/venues/33333333-3333-3333-3333-333333333333/logo/x.png'
);
-- Malformed paths must still return no row / false, never raise.
select * from public.event_assets_path_parts('foo/bar/baz/qux');
select public.can_write_event_asset('foo/bar/baz/qux') as should_be_false;
select public.can_write_event_asset(null)              as null_should_be_false;
rollback;

-- D) Public READ of event-assets objects is unaffected — governed by
--    the `event_assets_public_read` policy, which does not call either
--    helper. Confirm the policy still exists.
select polname, polcmd
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname like 'event_assets_%'
order by polname;
-- Expect: event_assets_delete_write, event_assets_insert_write,
--         event_assets_public_read, event_assets_update_write.

-- E) End-to-end smoke (out of SQL, via Storage API):
--    * anon GET  https://<project>.supabase.co/storage/v1/object/public/event-assets/<path> → 200
--    * agency_owner upload to {agency}/{event}/venues/{venue}/logo/x.png → 200
--    * agency_staff upload to same path → 403
--    * anon upload anywhere in event-assets → 403
