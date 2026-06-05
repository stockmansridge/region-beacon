# Venue lifecycle RPCs — draft migration

Adds three production RPCs that own the GetStampd venue disable / reactivate
/ hard-delete lifecycle, reusing the existing `public.venues.deleted_at`
column as the "disabled" marker.

## Files

- `01_venue_lifecycle_rpcs.sql` — creates
  `public._can_manage_agency_venue(uuid)`, `public.disable_venue(uuid, text)`,
  `public.reactivate_venue(uuid)`, and `public.hard_delete_venue(uuid)`.

## Why reuse `deleted_at` instead of adding `disabled_at`

The `venues` table already ships with a `deleted_at timestamptz` column that:

- is already excluded from active-venue counts by the
  `enforce_agency_venue_limit` trigger (`where deleted_at is null`);
- is already used by every read query in `src/routes/admin.events.$eventId.tsx`
  to hide "archived" venues;
- preserves the row for historical events, check-ins, passports, QR records
  and analytics.

This satisfies the brief's rule: *"Do not create a second archive/disable
column if the venues table already has a suitable archived/disabled field."*

## Behaviour summary

- `disable_venue(p_venue_id, p_reason)` — idempotent. Sets
  `deleted_at = now()` and `status = 'inactive'`. No-op if already disabled.
- `reactivate_venue(p_venue_id)` — idempotent for already-active venues.
  Re-checks the agency's `venue_limit` (via `get_agency_plan_limits`) before
  clearing the marker. Raises a friendly error if the org is at its limit.
- `hard_delete_venue(p_venue_id)` — physically deletes. Blocks when any
  `public.checkins` row references the venue. QR codes / offers cascade
  via existing FKs.

All three RPCs:

- run as `SECURITY DEFINER` with `set search_path = public`;
- require either platform admin (`is_platform_admin`) or agency admin
  (`is_agency_admin`) for the venue's agency;
- are granted to `authenticated` only.

## How to apply (GetStampd project: `kyjwifumacnrpgyextzz`)

Run `01_venue_lifecycle_rpcs.sql` against the GetStampd Supabase project.
Idempotent — safe to re-run.

## Rollback

```sql
drop function if exists public.hard_delete_venue(uuid);
drop function if exists public.reactivate_venue(uuid);
drop function if exists public.disable_venue(uuid, text);
drop function if exists public._can_manage_agency_venue(uuid);
```

Disabled venues remain in `public.venues` with `deleted_at` set and are
unaffected by the rollback.
