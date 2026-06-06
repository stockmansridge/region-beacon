-- 06_verify.sql — sanity selects. Run by hand after applying 01–05.

select 'event_awards' as tbl, count(*) from public.event_awards;
select 'event_award_draws' as tbl, count(*) from public.event_award_draws;

select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_event_awards_admin',
    'save_event_award',
    'delete_event_award',
    'draw_event_award_winner',
    'get_event_award_draws_admin',
    'get_public_event_awards',
    '_event_award_eligible_passports'
  )
order by proname;
