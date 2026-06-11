# Venue creation preflight — manual plan override RPC

## Root cause

`public.get_agency_plan_limits(uuid)` in production was the older version from
`supabase/migrations-draft-pricing/01_getstampd_venue_limits.sql` which only
looks at `public.agency_subscriptions`. It ignored
`agencies.manual_plan_override`.

System Admin → Organisations reads the override directly from
`public.agencies`, so it correctly showed SRW as Enterprise. The venue
creation preflight in `src/routes/admin.events.$eventId.tsx` calls
`get_agency_plan_limits`, which returned `plan_code=free, venue_limit=5`
because no paid subscription row existed — so saves were blocked at 5
venues.

## Fix

Re-apply the override-aware resolver from
`supabase/migrations-system-admin-plan-override/apply.sql`. This migration
is a focused, idempotent copy that only touches:

1. The `agencies.manual_plan_override*` columns (added if missing).
2. `public.get_agency_plan_limits(uuid)` — priority becomes
   `manual_plan_override` → active paid subscription → free.

No other RPCs, policies, grants, or tables are changed. Re-running is safe.

## Apply

Run `apply.sql` in the Supabase SQL editor.

## Verify

```sql
select public.get_agency_plan_limits('c509e63c-78d2-42b9-b132-cbd5a88857f3');
-- Expect: {"plan_code":"enterprise","venue_limit":null,...,"plan_source":"manual_override"}
```
