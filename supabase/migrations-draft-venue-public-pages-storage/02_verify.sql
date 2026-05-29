-- 02_verify.sql
-- DRAFT ONLY. Read-only verification queries for the venue-asset storage
-- policy extension. Run by hand on staging after applying 01_*.sql.

-- A) Path parser accepts the legacy event-level shape.
select * from public.event_assets_path_parts(
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/logo/hero.png'
);
-- Expect: 1 row, kind='logo', venue_id=null.

-- B) Path parser accepts the new venue-level shape.
select * from public.event_assets_path_parts(
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/venues/33333333-3333-3333-3333-333333333333/cover/x.webp'
);
-- Expect: 1 row, kind='cover', venue_id='33333333-…'.

-- C) Path parser rejects malformed inputs (no rows).
select * from public.event_assets_path_parts('foo/bar/baz/qux');
select * from public.event_assets_path_parts(
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/venues/not-a-uuid/logo/x.png'
);
select * from public.event_assets_path_parts(
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/venues/33333333-3333-3333-3333-333333333333/banner/x.png'
);
-- Expect: zero rows for each.

-- D) Confirm storage.objects policies still reference the helper. (No
--    schema change to the policies themselves; helpers are swapped in.)
select polname
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname like 'event_assets_%'
order by polname;

-- E) End-to-end write check (run as a real agency_owner session):
--    Try to insert a fake object via the storage API client at path
--    {agency}/{event}/venues/{venue}/logo/test.png and expect success.
--    Same path as agency_staff should fail. (Browser/integration test —
--    not a SQL one-liner.)

-- F) Confirm grants survived.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('event_assets_path_parts','can_write_event_asset')
order by routine_name, grantee;
