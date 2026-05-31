-- DRAFT — verification for 04_fix_redeem_checkin_ambiguous_passport_id.sql.
-- Read-only checks. Does NOT insert test data.
--
-- Run AFTER applying 04_*.sql.

-- 1) Function exists with the expected signature.
select
  n.nspname                                as schema_name,
  p.proname                                as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid)            as result,
  p.prosecdef                              as security_definer,
  p.proconfig                              as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'redeem_checkin';
-- Expect: 1 row.
-- args   = "_qr_token text, _passport_token text, _client_ip inet DEFAULT NULL::inet, _user_agent text DEFAULT NULL::text"
-- result = "TABLE(checkin_id uuid, venue_id uuid, passport_id uuid, is_new boolean)"
-- security_definer = t
-- settings contains 'search_path=public'

-- 2) EXECUTE grants for anon + authenticated still present.
select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name    = 'redeem_checkin'
  and grantee in ('anon','authenticated')
order by grantee;
-- Expect: 2 rows, both EXECUTE.

-- 3) Static check: function body no longer contains an unqualified
--    `passport_id` or `venue_id` reference that could collide with the
--    RETURNS TABLE OUT columns. (Allow occurrences only inside the
--    INSERT column list and the RETURNS TABLE declaration.)
select
  (position('where passport_id'  in pg_get_functiondef(p.oid)) = 0) as no_unqualified_where_passport_id,
  (position('where venue_id'     in pg_get_functiondef(p.oid)) = 0) as no_unqualified_where_venue_id,
  (position('extensions.digest(' in pg_get_functiondef(p.oid)) > 0) as pgcrypto_qualified
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'redeem_checkin';
-- Expect: all three columns = true.

-- 4) Negative test (read-only): invalid QR raises qr_invalid.
do $$
begin
  begin
    perform public.redeem_checkin(
      '__definitely_not_a_real_qr_token__',
      '__definitely_not_a_real_passport_token__'
    );
    raise notice 'UNEXPECTED: redeem_checkin did not raise for invalid QR';
  exception when others then
    raise notice 'OK: redeem_checkin raised SQLSTATE=% MESSAGE=%', SQLSTATE, SQLERRM;
    -- Expected: SQLERRM = 'qr_invalid'
  end;
end;
$$;

-- 5) Live retest is done from the app:
--    Open https://cargordwinetrail.getstampd.com.au/checkin/<token>
--    with a registered passport on the device and confirm:
--      * first scan  -> "You're checked in"  (is_new = true)
--      * second scan -> "Already stamped"    (is_new = false, no error)
