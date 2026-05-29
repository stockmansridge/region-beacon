-- =====================================================================
-- STAGING VERIFICATION — Billing schema. region-beacon-staging ONLY.
-- Read-only. Run in Supabase SQL Editor against STAGING.
-- DO NOT RUN AGAINST PRODUCTION.
-- Each numbered block maps 1:1 to the 14 verification items.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. All four billing tables exist. Expect 4 rows.
-- ---------------------------------------------------------------------
with expected(t) as (values
  ('agency_billing_accounts'),
  ('agency_subscriptions'),
  ('event_activations'),
  ('billing_events')
)
select e.t as table_name,
       exists(
         select 1 from information_schema.tables
         where table_schema='public' and table_name=e.t
       ) as present
from expected e order by e.t;

-- ---------------------------------------------------------------------
-- 2. RLS enabled on all four billing tables. Expect ZERO rows.
-- ---------------------------------------------------------------------
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='r'
  and c.relrowsecurity=false
  and c.relname in ('agency_billing_accounts','agency_subscriptions',
                    'event_activations','billing_events');

-- ---------------------------------------------------------------------
-- 3. No anon grants on any billing table. Expect ZERO rows.
-- ---------------------------------------------------------------------
select table_name, privilege_type
from information_schema.role_table_grants
where grantee='anon'
  and table_schema='public'
  and table_name in ('agency_billing_accounts','agency_subscriptions',
                     'event_activations','billing_events')
order by table_name, privilege_type;

-- ---------------------------------------------------------------------
-- 4. authenticated has SELECT only on billing tables.
--    Expect 4 rows, all privilege_type='SELECT'. No INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------
select table_name, privilege_type
from information_schema.role_table_grants
where grantee='authenticated'
  and table_schema='public'
  and table_name in ('agency_billing_accounts','agency_subscriptions',
                     'event_activations','billing_events')
order by table_name, privilege_type;

-- Sanity gate: should return ZERO rows.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee='authenticated'
  and table_schema='public'
  and table_name in ('agency_billing_accounts','agency_subscriptions',
                     'event_activations','billing_events')
  and privilege_type in ('INSERT','UPDATE','DELETE');

-- ---------------------------------------------------------------------
-- 5. No INSERT/UPDATE/DELETE policies on billing tables.
--    Expect ZERO rows.
-- ---------------------------------------------------------------------
select schemaname, tablename, policyname, cmd, roles, permissive
from pg_policies
where schemaname='public'
  and tablename in ('agency_billing_accounts','agency_subscriptions',
                    'event_activations','billing_events')
  and cmd in ('INSERT','UPDATE','DELETE');

-- Full policy listing for eyeballing:
select tablename, policyname, cmd, permissive, roles, qual
from pg_policies
where schemaname='public'
  and tablename in ('agency_billing_accounts','agency_subscriptions',
                    'event_activations','billing_events')
order by tablename, policyname;

-- ---------------------------------------------------------------------
-- 6 & 7. SELECT policy predicates use the right helpers.
--   Expect:
--     - agency_billing_accounts_select : is_platform_admin OR is_agency_admin
--     - agency_subscriptions_select    : is_platform_admin OR is_agency_admin
--     - event_activations_select       : is_platform_admin OR is_agency_admin
--       (is_agency_admin returns true for owner AND admin per 24_helpers.sql)
--     - billing_events_select          : is_platform_admin OR is_agency_owner
-- ---------------------------------------------------------------------
select tablename, policyname, cmd, qual
from pg_policies
where schemaname='public'
  and tablename in ('agency_billing_accounts','agency_subscriptions',
                    'event_activations','billing_events')
  and cmd='SELECT'
order by tablename;

-- ---------------------------------------------------------------------
-- 8. event_activations composite FK (agency_id, event_id) -> events(agency_id, id).
--    Expect ONE row whose definition contains
--      "FOREIGN KEY (agency_id, event_id) REFERENCES events(agency_id, id)".
-- ---------------------------------------------------------------------
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public'
  and t.relname='event_activations'
  and c.contype='f';

-- ---------------------------------------------------------------------
-- 9. agency_subscriptions partial unique index on (agency_id) for live states.
--    Expect ONE row, indexdef should contain
--      "UNIQUE INDEX uq_agency_subscriptions_live"
--      "(agency_id)"
--      "WHERE (status = ANY (ARRAY['trialing'::text, 'active'::text, ...]))"
-- ---------------------------------------------------------------------
select indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename='agency_subscriptions'
  and indexname='uq_agency_subscriptions_live';

-- ---------------------------------------------------------------------
-- 10. billing_events shape.
-- 10a. No updated_at column. Expect ZERO rows.
-- ---------------------------------------------------------------------
select column_name
from information_schema.columns
where table_schema='public'
  and table_name='billing_events'
  and column_name='updated_at';

-- 10b. No UPDATE or DELETE policies. Expect ZERO rows.
select policyname, cmd
from pg_policies
where schemaname='public'
  and tablename='billing_events'
  and cmd in ('UPDATE','DELETE');

-- 10c. Unique constraint / index on stripe_event_id. Expect at least one row.
select indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename='billing_events'
  and indexdef ilike '%stripe_event_id%'
  and indexdef ilike '%unique%';

-- ---------------------------------------------------------------------
-- 11. event_is_publishable(uuid) exists with the right attributes.
--    Expect ONE row: prosecdef=true, provolatile='s' (STABLE),
--    search_path=public in proconfig.
-- ---------------------------------------------------------------------
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef                              as security_definer,
       p.provolatile                            as volatility, -- 's' = STABLE
       p.proconfig                              as config
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='event_is_publishable';

-- ---------------------------------------------------------------------
-- 12 & 13. Behavioural matrix for event_is_publishable.
--   12: returns false for any existing draft / unpaid event.
--   13: returns true only when status='published' AND a primary active
--       domain exists AND an event_activations row is 'active' or 'comp'.
--
-- 12a. All non-published events should return false.
-- ---------------------------------------------------------------------
select e.id, e.status, public.event_is_publishable(e.id) as publishable
from public.events e
where e.deleted_at is null
  and e.status <> 'published'
order by e.created_at desc
limit 20;
-- Expect every publishable column = false.

-- 12b. Published events without active billing should return false.
select e.id,
       e.status,
       exists(select 1 from public.event_domains d
              where d.event_id=e.id and d.is_primary and d.status='active') as has_primary_active_domain,
       exists(select 1 from public.event_activations a
              where a.event_id=e.id and a.status in ('active','comp'))      as has_active_activation,
       public.event_is_publishable(e.id)                                    as publishable
from public.events e
where e.deleted_at is null
  and e.status='published'
order by e.created_at desc
limit 20;
-- Expect: publishable = (has_primary_active_domain AND has_active_activation).

-- 13. Synthetic per-condition truth-table using existing events.
--     This evaluates the helper against every published event and
--     classifies the result. Manually confirm rows match expectation.
select e.id,
       e.status='published'                                                 as cond_published,
       exists(select 1 from public.event_domains d
              where d.event_id=e.id and d.is_primary and d.status='active') as cond_domain,
       exists(select 1 from public.event_activations a
              where a.event_id=e.id and a.status in ('active','comp'))      as cond_activation,
       public.event_is_publishable(e.id)                                    as helper_result
from public.events e
where e.deleted_at is null
order by e.created_at desc
limit 50;
-- Expect helper_result = (cond_published AND cond_domain AND cond_activation) on every row.

-- ---------------------------------------------------------------------
-- 14. resolve_event_by_host not changed yet.
--     Expect ONE row. Inspect prosrc — it must NOT reference
--     event_is_publishable or event_activations.
-- ---------------------------------------------------------------------
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       (p.prosrc ilike '%event_is_publishable%') as references_publishable_helper,
       (p.prosrc ilike '%event_activations%')    as references_event_activations
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='resolve_event_by_host';
-- Both boolean columns MUST be false.

-- =====================================================================
-- END BILLING VERIFICATION
-- =====================================================================
