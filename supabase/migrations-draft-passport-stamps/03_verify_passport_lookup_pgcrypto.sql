-- Supabase SQL editor compatible verifier (no psql \set directives).
-- Safe: wrapped in begin; ... rollback; — leaves no data behind.
--
-- Run AFTER 02_fix_passport_lookup_pgcrypto.sql.
--
-- Expected: every "expected_*" column is true, and the lookup probe at
-- the end returns exactly one row.

begin;

-- 1. Confirm pgcrypto is in the extensions schema.
select e.extname, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

-- 2. Confirm each replaced function uses extensions.digest(...) and still has
--    SECURITY DEFINER + search_path=public.
select n.nspname as function_schema,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_config,
       position('extensions.digest(' in pg_get_functiondef(p.oid)) > 0
         as uses_qualified_digest,
       position(' digest(' in pg_get_functiondef(p.oid)) = 0
         as no_unqualified_digest
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'passport_token_hash',
    'get_passport_by_token',
    'update_marketing_consent',
    'redeem_checkin'
  )
order by p.proname, arguments;

-- 3. Live probe: a non-existent token must return zero rows (not error).
--    If this previously errored with SQLSTATE 42883 it would not have
--    returned a clean empty result.
set local search_path = public;
select count(*) as rows_for_bogus_token
from public.get_passport_by_token(
  'verify-passport-lookup-pgcrypto-bogus-token'
);

-- 4. EXECUTE grants remain on anon + authenticated.
select 'get_passport_by_token' as fn,
       has_function_privilege('anon',          'public.get_passport_by_token(text)',                                  'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', 'public.get_passport_by_token(text)',                                  'EXECUTE') as authn_exec
union all
select 'update_marketing_consent',
       has_function_privilege('anon',          'public.update_marketing_consent(text,text,inet,text)',                'EXECUTE'),
       has_function_privilege('authenticated', 'public.update_marketing_consent(text,text,inet,text)',                'EXECUTE')
union all
select 'redeem_checkin',
       has_function_privilege('anon',          'public.redeem_checkin(text,text,inet,text)',                          'EXECUTE'),
       has_function_privilege('authenticated', 'public.redeem_checkin(text,text,inet,text)',                          'EXECUTE')
union all
select 'passport_token_hash',
       has_function_privilege('anon',          'public.passport_token_hash(text)',                                    'EXECUTE'),
       has_function_privilege('authenticated', 'public.passport_token_hash(text)',                                    'EXECUTE');

rollback;
