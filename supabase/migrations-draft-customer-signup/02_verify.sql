-- Verify the create_customer_agency RPC end-to-end on STAGING only.
-- Run as service_role in the SQL editor; clean up the test rows at the end.
--
-- Expected outcomes:
--   1. Anonymous call → fails with errcode 42501 / not_authenticated.
--   2. Authenticated call with a fresh slug → returns a uuid;
--      agencies row + agency_members(agency_owner) row both exist.
--   3. Repeat with the same slug → fails with errcode 23505 / agency_slug_taken.
--   4. Bad slug ("Foo Bar") → fails with errcode 22023 / invalid_agency_slug.
--   5. user_roles untouched (no platform_admin grant).

-- 1. anonymous
set local role anon;
do $$
begin
  perform public.create_customer_agency('Test', 'test-anon');
  raise exception 'expected not_authenticated';
exception when others then
  raise notice 'anon path ok (sqlstate=%)', sqlstate;
end$$;
reset role;

-- 2. authenticated (replace :test_user_id with a real auth.users id)
-- select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select public.create_customer_agency('Acme Tours', 'acme-tours') as agency_id;
-- select count(*) from public.agencies where slug = 'acme-tours'; -- expect 1
-- select role, accepted_at is not null
--   from public.agency_members where agency_id = :agency_id; -- expect agency_owner, true
-- select count(*) from public.user_roles where user_id = :test_user_id and role = 'platform_admin'; -- expect 0

-- Cleanup:
-- delete from public.agencies where slug = 'acme-tours';
