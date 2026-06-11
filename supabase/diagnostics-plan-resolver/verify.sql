-- Plan resolver verification for Orange Hop On Hop Off (slug: ohoho).
-- Run in the Supabase SQL editor against the LIVE project.

-- 1. Agency row + resolver output side by side
select
  a.id,
  a.name,
  a.slug,
  a.manual_plan_override,
  a.status,
  public.get_agency_plan_limits(a.id) as limits,
  public.agency_effective_plan_code(a.id) as effective_plan
from public.agencies a
where a.slug = 'ohoho';

-- Expected:
--   manual_plan_override = 'pro_region'
--   limits ->> 'plan_code'   = 'pro_region'
--   limits ->> 'plan_source' = 'manual_override'
--   limits ->> 'venue_limit' = '100'
--   effective_plan = 'pro_region'

-- 2. Check for function overloads / stale signatures
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('get_agency_plan_limits', 'agency_effective_plan_code')
order by n.nspname, p.proname, args;
-- Expected: exactly ONE row per function, arg = '_agency_id uuid'.

-- 3. If manual_plan_override is a non-canonical label, normalise it:
-- update public.agencies
--   set manual_plan_override = replace(lower(trim(manual_plan_override)), ' ', '_')
-- where slug = 'ohoho';
