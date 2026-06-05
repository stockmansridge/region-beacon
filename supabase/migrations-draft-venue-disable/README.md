# Venue lifecycle RPCs — draft migration

Adds three production RPCs that own the GetStampd venue disable / reactivate
/ hard-delete lifecycle, reusing the existing `public.venues.deleted_at`
column as the "disabled" marker.

## Files

- `01_venue_lifecycle_rpcs.sql` — creates
  `public._can_manage_agency_venue(uuid)`, `public.disable_venue(uuid, text)`,
  `public.reactivate_venue(uuid)`, and `public.hard_delete_venue(uuid)`.
- `02_hard_delete_venue_strict.sql` — replaces `hard_delete_venue` with a
  schema-introspecting version that blocks deletion when ANY public-schema
  table has a foreign key to `public.venues(id)` and holds at least one row
  for the target venue. Future-proof: new venue-referencing tables are
  checked automatically. Currently this covers `checkins`, `venue_qr_codes`,
  and `venue_offers`, plus any other table added later with a `venue_id` FK.

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
- `hard_delete_venue(p_venue_id)` — physically deletes. Blocks when ANY
  table in the `public` schema with a foreign key to `public.venues(id)`
  has at least one row referencing this venue. Dependents are discovered
  at runtime via `information_schema`, so the check stays correct as the
  schema evolves (current dependents: `checkins`, `venue_qr_codes`,
  `venue_offers`). The error message is:
  *"This venue cannot be permanently deleted because it is linked to
  existing events or historical activity. Disable it instead."*

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

## 03_force_delete_venue.sql

Adds `public.force_delete_venue(p_venue_id uuid, p_confirm_text text)`.

- **Platform-admin only** (guarded with `public.is_platform_admin(auth.uid())`).
- Rejects unless `p_confirm_text = 'DELETE VENUE AND HISTORY'` (exact match).
- Destructive: discovers every public-schema table with a FK to `public.venues(id)` via `information_schema` (same introspection used in `02_hard_delete_venue_strict.sql`) and `DELETE`s the matching rows in each — currently `checkins`, `venue_qr_codes`, `venue_offers`, plus any future FK tables automatically — then deletes the venue row.
- `RAISE NOTICE` records `venue=<id> agency=<id> by=<auth.uid()> deleted=[table=N, ...]` for an audit breadcrumb.
- The safe `hard_delete_venue` RPC is **unchanged** and remains the only path for normal organisation admins.

## 04_force_delete_venue_order_fix.sql

Replaces `force_delete_venue` body to fix this runtime error:

> update or delete on table "venue_qr_codes" violates foreign key constraint "checkins_qr_fk" on table "checkins"

`public.checkins.venue_qr_code_id` has an `ON DELETE RESTRICT` FK to `public.venue_qr_codes`, so checkins is a grandchild via venue_qr_codes. The previous version deleted FK tables in arbitrary `information_schema` order and could remove `venue_qr_codes` before `checkins`.

New order:
1. **Phase 1** — `delete from public.checkins where venue_id = $1` (grandchild via `venue_qr_codes`).
2. **Phase 2** — dynamic discovery of every other public-schema table with a FK to `public.venues(id)`, deleted in arbitrary order. Excludes `venues` and `checkins`. Currently this clears `venue_qr_codes` and `venue_offers`; any future FK table is picked up automatically.
3. **Phase 3** — `delete from public.venues where id = $1`.

If a future schema adds another `ON DELETE RESTRICT` grandchild on top of a venue-linked table, add it to Phase 1.
