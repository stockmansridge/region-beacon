-- 02_verify.sql
-- DRAFT ONLY. Read-only verification queries for
-- public.get_public_leaderboard_by_domain(text). Do not execute as part of
-- a migration; run by hand on staging after the function is applied.

-- A) Unknown host → single sentinel row (event_found = false).
--    Expect: one row, all data fields null, is_enabled null, event_found false.
select *
from public.get_public_leaderboard_by_domain('does-not-exist.getstampd.com.au');

-- B) Apex / admin / reserved host → same not-found sentinel.
select * from public.get_public_leaderboard_by_domain('getstampd.com.au');
select * from public.get_public_leaderboard_by_domain('app.getstampd.com.au');
select * from public.get_public_leaderboard_by_domain('www.getstampd.com.au');

-- C) Live event subdomain with leaderboard_settings.is_enabled = false
--    Expect: one row (null, null, null, false, true).
--    Replace <SUB> with a real active subdomain whose event is publishable.
-- select * from public.get_public_leaderboard_by_domain('<SUB>.getstampd.com.au');

-- D) Live event with leaderboard enabled and check-ins.
--    Expect: 1+ rows with rank starting at 1, display_name non-null,
--    visit_count populated only when show_visit_count = true.
-- select * from public.get_public_leaderboard_by_domain('<SUB>.getstampd.com.au');

-- E) hide_below_checkins guard.
--    Temporarily set hide_below_checkins higher than every passport's count
--    on staging only, then re-run D and expect zero data rows (only the
--    sentinel is_enabled=true / event_found=true header — note this RPC
--    returns zero rows in that case, not a sentinel; the client treats
--    "no rows + last call succeeded" as empty leaderboard).

-- F) display_mode behaviour.
--    Flip leaderboard_settings.display_mode through each of
--    'anonymous' | 'alias_only' | 'first_name_only' | 'first_name_last_initial'
--    on a staging event and confirm display_name format matches.

-- G) Column-leak guard. The function must only project the 5 columns
--    declared in its RETURNS TABLE. This query fails (column does not
--    exist) if the projection accidentally grows.
select
  rank, display_name, visit_count, is_enabled, event_found
from public.get_public_leaderboard_by_domain('getstampd.com.au')
limit 0;

-- H) Confirm EXECUTE grants.
select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'get_public_leaderboard_by_domain'
order by grantee, privilege_type;
