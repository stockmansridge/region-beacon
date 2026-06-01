-- 07_verify_get_passport_stamps_pgcrypto.sql
-- Supabase SQL editor compatible verifier. No persistent changes.
--
-- Run after 06_fix_get_passport_stamps_pgcrypto.sql is applied.
-- Wrap in a transaction and ROLLBACK at the end so nothing persists.
--
-- Before running, replace the fixture below with a real raw access token
-- from a known test passport that has at least one check-in:
--
--   :test_raw_token   -- raw access_token (NOT the hash)
--
-- If your client cannot bind variables, replace the literal in section 4
-- with the raw token surrounded by single quotes.

begin;

-- 1. pgcrypto resolvable in extensions schema.
select e.extname, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

-- 2. Function still has SECURITY DEFINER, search_path = public, and uses
--    extensions-qualified pgcrypto. Static body check.
select
  p.prosecdef                                                       as security_definer,
  p.proconfig                                                       as function_config,
  position('extensions.digest(_raw_token, ''sha256'')' in pg_get_functiondef(p.oid)) > 0
                                                                    as uses_qualified_digest,
  position(' digest(_raw_token' in pg_get_functiondef(p.oid)) = 0   as no_unqualified_digest
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_passport_stamps_by_token'
  and pg_get_function_identity_arguments(p.oid) = 'text';

-- 3. EXECUTE grants preserved.
select
  has_function_privilege('anon',
    'public.get_passport_stamps_by_token(text)', 'EXECUTE')          as anon_can_execute,
  has_function_privilege('authenticated',
    'public.get_passport_stamps_by_token(text)', 'EXECUTE')          as authenticated_can_execute;

-- 4. Valid passport token returns venue rows, no 42883 error.
--    Replace 'REPLACE_WITH_REAL_RAW_TOKEN' with a known test token.
create temporary table verify_stamps_result on commit drop as
select * from public.get_passport_stamps_by_token('REPLACE_WITH_REAL_RAW_TOKEN');

select
  count(*)                                       as row_count,
  count(*) filter (where is_stamped)             as stamped_row_count,
  max(total_venues)                              as total_venues,
  max(stamped_count)                             as stamped_count,
  bool_or(is_stamped)                            as at_least_one_stamped
from verify_stamps_result;

-- 5. Invalid token returns zero rows (NOT a pgcrypto error).
select count(*) as invalid_token_row_count
from public.get_passport_stamps_by_token('not-a-real-token-xxxxxxxx');

-- 6. Short/empty token returns zero rows via the guard.
select count(*) as short_token_row_count
from public.get_passport_stamps_by_token('');

rollback;
