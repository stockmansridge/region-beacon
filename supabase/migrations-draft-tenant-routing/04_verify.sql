-- DRAFT — sanity checks to run after applying 01–03. Read-only.

-- 1. RPCs exist and have expected return shape.
select pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_agency_by_subdomain','get_public_event_by_agency_and_slug')
order by p.proname;

-- 2. Reserved labels return zero rows.
select * from public.resolve_agency_by_subdomain('app');
select * from public.resolve_agency_by_subdomain('admin');
select * from public.resolve_agency_by_subdomain('www');

-- 3. Pick a real agency slug and confirm it resolves.
-- select * from public.resolve_agency_by_subdomain('<some-real-slug>');

-- 4. Confirm event resolver returns only published events.
-- select * from public.get_public_event_by_agency_and_slug('<slug>', '<event-slug>');

-- 5. Check shape constraint definition.
select conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname = 'agencies'
  and conname = 'agencies_slug_subdomain_shape_chk';
