-- =====================================================================
-- STAGING VERIFICATION SCRIPT v2 — region-beacon-staging ONLY.
-- Read-only. Run in the Supabase SQL Editor against staging.
-- Each numbered block maps 1:1 to the 15 verification items.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. All expected tables exist.
-- Expect EXACTLY these 22 rows. Any missing name = failed migration.
-- ---------------------------------------------------------------------
with expected(t) as (values
  ('agencies'),('agency_members'),('audit_logs'),('checkins'),
  ('event_branding'),('event_checkin_settings'),('event_domains'),
  ('event_terms_versions'),('events'),('export_logs'),
  ('leaderboard_settings'),('passports'),('prize_rules'),
  ('reward_rules'),('user_roles'),('venue_offers'),('venue_qr_codes'),
  ('venues'),('visitor_consents'),('visitors')
  -- Note: adjust to 22 if your draft set adds more; count below is the gate.
),
actual as (
  select table_name from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'
)
select
  (select count(*) from actual)               as actual_table_count,
  (select count(*) from expected)             as expected_min_count,
  array(select t from expected except select table_name from actual) as missing_tables,
  array(select table_name from actual except select t from expected) as extra_tables;

-- Full table list for eyeballing:
select table_name from information_schema.tables
 where table_schema='public' and table_type='BASE TABLE'
 order by table_name;

-- ---------------------------------------------------------------------
-- 2. RLS enabled on every public table. Expect ZERO rows.
-- ---------------------------------------------------------------------
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false;

-- ---------------------------------------------------------------------
-- 3. No anon table grants. Expect ZERO rows.
-- ---------------------------------------------------------------------
select table_name, privilege_type
from information_schema.role_table_grants
where grantee='anon' and table_schema='public'
order by table_name, privilege_type;

-- ---------------------------------------------------------------------
-- 4. Enums exist: app_role and agency_role. Expect 2 rows.
-- ---------------------------------------------------------------------
select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_type t
join pg_enum e on e.enumtypid=t.oid
join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typname in ('app_role','agency_role')
group by t.typname
order by t.typname;

-- ---------------------------------------------------------------------
-- 5. Helper functions exist. Expect all of these names present.
--    is_platform_admin, is_agency_member, is_agency_admin,
--    is_agency_owner, has_role, is_valid_public_slug,
--    is_reserved_public_slug, tg_set_updated_at, tg_audit_row
-- ---------------------------------------------------------------------
with expected(fn) as (values
  ('is_platform_admin'),('is_agency_member'),('is_agency_admin'),
  ('is_agency_owner'),('has_role'),('is_valid_public_slug'),
  ('is_reserved_public_slug'),('tg_set_updated_at'),('tg_audit_row')
)
select e.fn,
       exists(select 1 from pg_proc p
              join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname=e.fn) as present
from expected e order by e.fn;

-- ---------------------------------------------------------------------
-- 6. Public RPCs exist. Expect all present=true.
-- ---------------------------------------------------------------------
with expected(fn) as (values
  ('resolve_event_by_host'),('get_public_event'),
  ('get_public_event_by_domain'),('get_public_event_venues'),
  ('get_public_venue_offers'),('get_public_leaderboard'),
  ('validate_public_subdomain')
)
select e.fn,
       exists(select 1 from pg_proc p
              join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname=e.fn and p.prosecdef) as present_secdef
from expected e order by e.fn;

-- ---------------------------------------------------------------------
-- 7. Visitor RPCs exist. Names depend on 33_rpcs_visitor.sql — adjust
--    the expected list if you renamed any. Expect all present=true.
-- ---------------------------------------------------------------------
with expected(fn) as (values
  ('register_visitor'),('get_passport_by_token'),
  ('redeem_checkin'),('record_visitor_consent')
)
select e.fn,
       exists(select 1 from pg_proc p
              join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname=e.fn) as present
from expected e order by e.fn;

-- ---------------------------------------------------------------------
-- 8. Admin RPCs exist. Adjust list to whatever 34_rpcs_admin.sql defines.
-- ---------------------------------------------------------------------
select p.proname, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname like 'admin\_%' escape '\'
order by p.proname;

-- ---------------------------------------------------------------------
-- 9. Reserved subdomain rows seeded.
--    Expect 22 platform_reserved rows (matches 03_util reserved list).
-- ---------------------------------------------------------------------
select count(*) filter (where domain_type='platform_reserved') as reserved_count
from public.event_domains;

select public_subdomain
from public.event_domains
where domain_type='platform_reserved'
order by public_subdomain;

-- ---------------------------------------------------------------------
-- 10. app.easypassport.com.au represented correctly.
--     Expect:
--       - one platform_reserved row with public_subdomain='app'
--       - one platform_admin   row with custom_domain='app.easypassport.com.au'
--                                 and public_subdomain IS NULL
--       - one platform_marketing row with custom_domain='easypassport.com.au'
-- ---------------------------------------------------------------------
select domain_type, public_subdomain, custom_domain, status
from public.event_domains
where public_subdomain='app'
   or custom_domain in ('app.easypassport.com.au','easypassport.com.au')
order by domain_type;

-- ---------------------------------------------------------------------
-- 11. checkins must NOT have INSERT/UPDATE/DELETE for anon or authenticated.
--     Expect ZERO rows.
-- ---------------------------------------------------------------------
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='checkins'
  and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE');

-- For reference, what grants DO exist on checkins:
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='checkins'
order by grantee, privilege_type;

-- ---------------------------------------------------------------------
-- 12. events.current_terms_version_id uses a tenant-safe composite FK.
--     Expect ONE row, definition includes
--     "FOREIGN KEY (agency_id, id, current_terms_version_id)
--      REFERENCES event_terms_versions(agency_id, event_id, id)"
--     and "ON DELETE RESTRICT".
-- ---------------------------------------------------------------------
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname='events'
  and c.contype='f'
  and pg_get_constraintdef(c.oid) ilike '%event_terms_versions%';

-- ---------------------------------------------------------------------
-- 13. visitor_consents_passport_fk uses ON DELETE RESTRICT.
-- ---------------------------------------------------------------------
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public'
  and t.relname='visitor_consents'
  and c.conname='visitor_consents_passport_fk';
-- Expect definition to contain "ON DELETE RESTRICT".

-- ---------------------------------------------------------------------
-- 14. checkins_qr_fk uses ON DELETE RESTRICT.
-- ---------------------------------------------------------------------
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public'
  and t.relname='checkins'
  and c.conname='checkins_qr_fk';
-- Expect definition to contain "ON DELETE RESTRICT".

-- ---------------------------------------------------------------------
-- 15. resolve_event_by_host behavioural matrix.
--     Interpret 'kind' column:
--       'marketing' for apex
--       'admin'     for app.easypassport.com.au (and with :port)
--       'not_found' for unseeded subdomains, reserved labels,
--                    and arbitrary custom hosts (until you add a row)
--       'event'     once you seed an event_subdomain or event_custom row
-- ---------------------------------------------------------------------
select 'apex marketing'           as case, *
  from public.resolve_event_by_host('easypassport.com.au');

select 'admin host'               as case, *
  from public.resolve_event_by_host('app.easypassport.com.au');

select 'admin host with port'     as case, *
  from public.resolve_event_by_host('app.easypassport.com.au:443');

select 'unseeded event subdomain' as case, *
  from public.resolve_event_by_host('example.easypassport.com.au');

select 'reserved label rejected'  as case, *
  from public.resolve_event_by_host('admin.easypassport.com.au');

select 'arbitrary custom domain'  as case, *
  from public.resolve_event_by_host('arbitrary.example.com');

-- =====================================================================
-- END VERIFICATION
-- =====================================================================
