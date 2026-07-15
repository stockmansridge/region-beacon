-- Verify the live production body of public.claim_bonus_code(text, text).
-- This makes no persistent changes.
--
-- Expected result: every boolean below should be true.

select
  p.prosecdef as security_definer,
  p.proconfig::text like '%search_path=public%' as search_path_includes_public,
  position('extensions.digest(_passport_token::text, ''sha256''::text)' in pg_get_functiondef(p.oid)) > 0
    as uses_qualified_digest,
  position('where pp.access_token_hash = digest(_passport_token' in pg_get_functiondef(p.oid)) = 0
    as no_unqualified_digest_lookup,
  position('on conflict (event_id, participant_id, award_type, source_id)' in lower(pg_get_functiondef(p.oid))) = 0
    as no_bare_event_id_on_conflict,
  has_function_privilege('anon', 'public.claim_bonus_code(text, text)', 'EXECUTE')
    as anon_can_execute,
  has_function_privilege('authenticated', 'public.claim_bonus_code(text, text)', 'EXECUTE')
    as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_bonus_code'
  and pg_get_function_identity_arguments(p.oid) = 'text, text';