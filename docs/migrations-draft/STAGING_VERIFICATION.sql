-- =====================================================================
-- STAGING VERIFICATION QUERIES — run AFTER the apply bundle succeeds.
-- Target: region-beacon-staging only. Read-only checks.
-- =====================================================================

-- 1. Tables created (expect 22 app tables in public).
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- 2. Enums created (expect app_role, agency_role).
select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname
order by t.typname;

-- 3. Helper functions (expect is_platform_admin, is_agency_member,
--    is_agency_admin, is_agency_owner, has_role, tg_set_updated_at,
--    tg_audit_row, is_valid_public_slug, is_reserved_public_slug).
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       l.lanname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language  l on l.oid = p.prolang
where n.nspname = 'public'
order by p.proname;

-- 4. RPCs specifically (any SECURITY DEFINER function callable via PostgREST).
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- 5. RLS enabled on every public table (expect rowsecurity = true everywhere).
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 6. No anon table grants on app tables (expect ZERO rows).
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
order by table_name, privilege_type;

-- 6b. checkins must NOT grant INSERT/UPDATE/DELETE to authenticated.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'checkins'
order by grantee, privilege_type;

-- 7. Reserved subdomain rows seeded (expect 22 platform_reserved rows).
select count(*) as reserved_rows
from public.event_domains
where domain_type = 'platform_reserved';

select public_subdomain
from public.event_domains
where domain_type = 'platform_reserved'
order by public_subdomain;

-- 8. event_domains 'app' reserved + admin host handling.
select domain_type, public_subdomain, custom_domain, status
from public.event_domains
where public_subdomain = 'app' or custom_domain in ('easypassport.com.au','app.easypassport.com.au')
order by domain_type;

-- 9. Composite-tenant FKs exist on checkins / passports / visitors.
select tc.table_name, tc.constraint_name,
       pg_get_constraintdef(pgc.oid) as definition
from information_schema.table_constraints tc
join pg_constraint pgc on pgc.conname = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in ('checkins','passports','visitors','venue_qr_codes','venue_offers','event_domains','event_branding')
order by tc.table_name, tc.constraint_name;

-- 10. resolve_event_by_host — behavioural checks.
select 'marketing apex'           as case, * from public.resolve_event_by_host('easypassport.com.au');
select 'admin host'               as case, * from public.resolve_event_by_host('app.easypassport.com.au');
select 'admin host w/ port'       as case, * from public.resolve_event_by_host('app.easypassport.com.au:443');
select 'unseeded event subdomain' as case, * from public.resolve_event_by_host('example.easypassport.com.au');
select 'arbitrary custom domain'  as case, * from public.resolve_event_by_host('arbitrary.example.com');
select 'reserved label rejected'  as case, * from public.resolve_event_by_host('admin.easypassport.com.au');

-- 11. Policies present on each table (sanity: deny_all should be gone on
--     tables that received Pass-B policies).
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
