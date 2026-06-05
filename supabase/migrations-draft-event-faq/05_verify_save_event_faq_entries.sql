-- Verification only. Run in the SQL editor after applying 03.

-- Expected function arguments:
--   p_event_id uuid, p_entries jsonb
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_event_faq_entries';

-- Actual membership role/status shape used by GetStampd.
-- Expected roles from migrations:
--   agency_owner, agency_admin, agency_staff
-- Expected accepted status model:
--   accepted_at is not null, not a status column.
select distinct role, accepted_at is not null as accepted
from public.agency_members
order by role, accepted;