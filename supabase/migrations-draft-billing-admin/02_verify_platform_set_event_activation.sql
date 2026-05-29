-- 02_verify_platform_set_event_activation.sql
-- Draft only. Do not execute as-is in production.
-- Intended for region-beacon-staging.
--
-- Run as a superuser / migration role for the structural checks (1-3).
-- Sections 4-6 demonstrate the behavioural checks; you must sign in as the
-- relevant users via the Supabase client to exercise auth.uid().

-- 1. RPC exists with the expected signature
select n.nspname              as schema,
       p.proname              as name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef            as security_definer,
       l.lanname              as language
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language  l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname = 'platform_set_event_activation';
-- Expect: 1 row, security_definer = true, language = plpgsql,
--   args = "_event_id uuid, _status text, _activation_kind text, _expires_at timestamp with time zone"

-- 2. EXECUTE grant to authenticated exists
select grantee, privilege_type
  from information_schema.role_routine_grants
 where specific_schema = 'public'
   and routine_name = 'platform_set_event_activation'
   and grantee in ('authenticated','anon','public','service_role')
 order by grantee;
-- Expect: authenticated -> EXECUTE present
-- Expect: anon          -> NOT present
-- Expect: public        -> NOT present (revoked)

-- 3. Direct check: anon must NOT have execute
select has_function_privilege(
  'anon',
  'public.platform_set_event_activation(uuid, text, text, timestamptz)',
  'execute'
) as anon_can_execute;
-- Expect: false

select has_function_privilege(
  'authenticated',
  'public.platform_set_event_activation(uuid, text, text, timestamptz)',
  'execute'
) as authenticated_can_execute;
-- Expect: true

-- ---------------------------------------------------------------------------
-- 4. Negative test: non-platform-admin caller is rejected.
--
-- Run this from a client session signed in as a normal agency_owner /
-- agency_admin (NOT platform_admin). The call MUST raise:
--   "access denied: platform_admin required"
--
--   select * from public.platform_set_event_activation(
--     '<event-uuid>'::uuid, 'comp', 'comp', null
--   );
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Positive test: platform_admin call updates event_activations and
--    appends a billing_events audit row.
--
-- Signed in as a platform_admin user, capture before/after:
--
--   -- BEFORE
--   select status, activation_kind, activated_at, expires_at, updated_at
--     from public.event_activations
--    where event_id = '<event-uuid>';
--
--   select count(*) as billing_events_before
--     from public.billing_events
--    where event_id = '<event-uuid>'
--      and event_type = 'platform.manual_event_activation';
--
--   -- CALL
--   select * from public.platform_set_event_activation(
--     '<event-uuid>'::uuid, 'comp', 'comp', null
--   );
--
--   -- AFTER: row reflects new status, activated_at stamped if first time
--   select status, activation_kind, activated_at, expires_at, updated_at
--     from public.event_activations
--    where event_id = '<event-uuid>';
--
--   -- AFTER: exactly one new audit row, payload carries old/new status
--   select created_at, actor_user_id, payload
--     from public.billing_events
--    where event_id = '<event-uuid>'
--      and event_type = 'platform.manual_event_activation'
--    order by created_at desc
--    limit 1;
-- ---------------------------------------------------------------------------

-- 6. Confirm side-effects are bounded:
--    - events.status unchanged for the target event
--    - event_domains.status unchanged for the target event
--
--   select id, status from public.events
--    where id = '<event-uuid>';
--
--   select event_id, public_subdomain, custom_domain, status, is_primary
--     from public.event_domains
--    where event_id = '<event-uuid>';
--
-- Compare against pre-call snapshot — values must be identical.
