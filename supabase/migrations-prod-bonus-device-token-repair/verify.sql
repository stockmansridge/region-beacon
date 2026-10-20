-- READ ONLY. No QR tokens, bearer tokens or personal details returned.
select current_database(),
  p.prosecdef as security_definer,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result,
  p.proacl as grants,
  position('event_bonus_code_venues' in pg_get_functiondef(p.oid)) > 0 as venue_aware,
  position('resolve_passport_id_by_token' in pg_get_functiondef(p.oid)) > 0 as device_aware,
  position('on conflict' in lower(pg_get_functiondef(p.oid))) > 0 as conflict_safe
from pg_proc p where p.oid = 'public.claim_bonus_code(text,text)'::regprocedure;

select indexdef from pg_indexes
where schemaname='public' and tablename='participant_point_awards'
and indexname='participant_point_awards_unique_source';
