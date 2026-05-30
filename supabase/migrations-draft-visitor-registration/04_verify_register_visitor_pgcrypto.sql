-- DRAFT verification — do not execute until the migration is approved/applied.
--
-- Purpose:
--   Verify the pgcrypto/register_visitor production fix without leaving test
--   visitor, passport, or consent data behind. This script runs inside a
--   transaction and ends with ROLLBACK.
--
-- Before running, replace these two known-good production fixture values if
-- needed. The defaults below come from the reported failing live support case.
\set fixture_event_id '41ebf116-6e70-428f-8dcb-bda56f73fb8a'
\set fixture_terms_version_id '08af0c96-e476-4600-ab95-ad209e057fe1'

begin;

-- Keep all verification writes rollback-safe. Do not change this to COMMIT.

-- ---------------------------------------------------------------------------
-- 1. pgcrypto is available, and installed where the migration expects it.
-- ---------------------------------------------------------------------------
select e.extname,
       n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';
-- Expected: one row, extension_schema = 'extensions'.

select n.nspname as function_schema,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('gen_random_bytes', 'digest')
  and n.nspname in ('extensions', 'public')
order by p.proname, n.nspname, arguments;
-- Expected includes:
--   extensions.gen_random_bytes(integer)
--   extensions.digest(text,text)

-- ---------------------------------------------------------------------------
-- 2. gen_random_bytes resolves in the same effective context used by
--    register_visitor: locked search_path = public, with pgcrypto calls
--    schema-qualified to extensions.
-- ---------------------------------------------------------------------------
set local search_path = public;

select encode(extensions.gen_random_bytes(8), 'hex') as qualified_random_bytes_hex,
       encode(extensions.digest('register_visitor_pgcrypto_verify', 'sha256'), 'hex') as qualified_digest_hex;
-- Expected: one row with non-empty hex strings.

select p.prosecdef as security_definer,
       p.proconfig as function_config,
       position('extensions.gen_random_bytes(32)' in pg_get_functiondef(p.oid)) > 0 as uses_qualified_gen_random_bytes,
       position('extensions.digest(v_raw, ''sha256'')' in pg_get_functiondef(p.oid)) > 0 as uses_qualified_digest
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'register_visitor'
  and pg_get_function_identity_arguments(p.oid) = 'uuid, citext, text, text, text, text, text, boolean, uuid, text, inet, text';
-- Expected:
--   security_definer = true
--   function_config includes "search_path=public"
--   uses_qualified_gen_random_bytes = true
--   uses_qualified_digest = true

-- ---------------------------------------------------------------------------
-- 3. Confirm fixture event is currently valid for registration.
-- ---------------------------------------------------------------------------
select e.id,
       e.status,
       e.current_terms_version_id,
       public.event_is_publishable(e.id) as is_publishable
from public.events e
where e.id = :'fixture_event_id'::uuid;
-- Expected:
--   status/publishability allow registration
--   current_terms_version_id = :'fixture_terms_version_id'

-- ---------------------------------------------------------------------------
-- 4. register_visitor can create a visitor/passport for the fixture event.
--    Test identity is deterministic and rollback-safe.
-- ---------------------------------------------------------------------------
create temporary table verify_register_visitor_result on commit drop as
select *
from public.register_visitor(
  _event_id := :'fixture_event_id'::uuid,
  _email := ('qa+pgcrypto-' || replace(:'fixture_event_id', '-', '') || '@getstampd.test')::citext,
  _full_name := 'QA pgcrypto rollback test',
  _first_name := 'QA',
  _last_name := 'Pgcrypto',
  _mobile := null,
  _postcode := null,
  _marketing_opt_in := false,
  _accepted_terms_version_id := :'fixture_terms_version_id'::uuid,
  _locale := 'en-AU',
  _client_ip := null,
  _user_agent := 'register_visitor_pgcrypto_verify'
);

select passport_id,
       length(access_token) > 20 as returned_access_token_present
from verify_register_visitor_result;
-- Expected: one passport_id and returned_access_token_present = true.

select v.id as visitor_id,
       p.id as passport_id,
       octet_length(p.access_token_hash) as access_token_hash_bytes,
       array_agg(vc.consent_type order by vc.consent_type) as consent_types
from public.visitors v
join public.passports p on p.visitor_id = v.id
left join public.visitor_consents vc on vc.passport_id = p.id
where v.event_id = :'fixture_event_id'::uuid
  and v.email = ('qa+pgcrypto-' || replace(:'fixture_event_id', '-', '') || '@getstampd.test')::citext
group by v.id, p.id, p.access_token_hash;
-- Expected:
--   access_token_hash_bytes = 32
--   consent_types contains privacy and terms only for this false marketing opt-in test.

-- ---------------------------------------------------------------------------
-- 5. Created test rows are safely identifiable and will be rolled back.
-- ---------------------------------------------------------------------------
select 'rollback_safe_test_identity' as check_name,
       :'fixture_event_id'::uuid as event_id,
       ('qa+pgcrypto-' || replace(:'fixture_event_id', '-', '') || '@getstampd.test')::citext as test_email,
       count(*) as matching_test_visitors
from public.visitors
where event_id = :'fixture_event_id'::uuid
  and email = ('qa+pgcrypto-' || replace(:'fixture_event_id', '-', '') || '@getstampd.test')::citext;
-- Expected during transaction: matching_test_visitors = 1.
-- After ROLLBACK: matching_test_visitors = 0 if re-run as a standalone select.

-- ---------------------------------------------------------------------------
-- 6. Existing EXECUTE grants remain correct.
-- ---------------------------------------------------------------------------
select has_function_privilege(
         'anon',
         'public.register_visitor(uuid,citext,text,text,text,text,text,boolean,uuid,text,inet,text)',
         'EXECUTE'
       ) as anon_can_execute,
       has_function_privilege(
         'authenticated',
         'public.register_visitor(uuid,citext,text,text,text,text,text,boolean,uuid,text,inet,text)',
         'EXECUTE'
       ) as authenticated_can_execute;
-- Expected: both true.

rollback;
