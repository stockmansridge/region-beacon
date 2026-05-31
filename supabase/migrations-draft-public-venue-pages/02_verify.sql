-- 02_verify.sql — manual smoke tests for the public venue RPCs.
-- Replace <SUB>, <LIVE_SUB>, <VENUE_ID> as appropriate.

-- 1) Grants. Should show anon + authenticated EXECUTE on both functions.
select
  n.nspname     as schema,
  p.proname     as fn,
  pg_get_function_identity_arguments(p.oid) as args,
  r.rolname     as grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join lateral aclexplode(p.proacl) a on true
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in ('get_public_venues_by_domain', 'get_public_venue_by_domain')
  and a.privilege_type = 'EXECUTE'
order by p.proname, r.rolname;

-- 2) Unknown host → list returns a single sentinel row with event_found=false.
select * from public.get_public_venues_by_domain('does-not-exist.getstampd.com.au');

-- 3) Apex / admin / reserved hosts → all sentinel rows (kind <> 'event').
select * from public.get_public_venues_by_domain('getstampd.com.au');
select * from public.get_public_venues_by_domain('app.getstampd.com.au');

-- 4) Live event host → real venue rows, event_found=true.
--    Replace <LIVE_SUB> with an actually-published event subdomain.
select * from public.get_public_venues_by_domain('<LIVE_SUB>.getstampd.com.au');

-- 5) Detail RPC: unknown host → zero rows.
select * from public.get_public_venue_by_domain(
  'does-not-exist.getstampd.com.au',
  '00000000-0000-0000-0000-000000000000'
);

-- 6) Detail RPC: wrong venue id for the event → zero rows.
select * from public.get_public_venue_by_domain(
  '<LIVE_SUB>.getstampd.com.au',
  '00000000-0000-0000-0000-000000000000'
);

-- 7) Detail RPC: real venue id of a live event → exactly one row.
select * from public.get_public_venue_by_domain(
  '<LIVE_SUB>.getstampd.com.au',
  '<VENUE_ID>'
);

-- 8) Privacy check: confirm neither function exposes forbidden columns.
--    Returns the OUT-parameter row type for each function. The set MUST be
--    exactly the public-safe projection.
select p.proname, pg_get_function_result(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_venues_by_domain', 'get_public_venue_by_domain');

-- 9) Anon role smoke check — should succeed (sentinel for unknown host).
set local role anon;
select event_found from public.get_public_venues_by_domain('does-not-exist.getstampd.com.au');
reset role;
