# Event Awards / Prizes — DRAFT migrations

**DO NOT execute against production without review.**

Adds an Awards system on top of the existing points / passport / check-in
data. Does not modify the points ledger, leaderboard, check-in flow, or
passport claim logic.

## Files (apply in order)

1. `01_event_awards.sql` — `public.event_awards` table + indexes + RLS
   (deny-all; access via RPCs only).
2. `02_event_award_draws.sql` — `public.event_award_draws` append-only
   draw history + indexes + RLS.
3. `03_storage_event_awards.sql` — extends
   `public.event_assets_path_parts` so the existing `event-assets`
   bucket accepts the additional `awards/` kind. No new bucket; no
   new write policies (the existing `event_assets_insert_write` /
   `_update_write` / `_delete_write` policies on `storage.objects`
   already cover any path that `can_write_event_asset` accepts, and
   that helper now passes `awards` because it relies on
   `event_assets_path_parts`).
4. `04_admin_rpcs.sql` — `get_event_awards_admin`, `save_event_award`,
   `delete_event_award`, `draw_event_award_winner`,
   `get_event_award_draws_admin`. All `SECURITY DEFINER`, gated by
   `public.can_admin_event(event_id)`.
5. `05_public_rpcs.sql` — `get_public_event_awards` returning
   eligibility + entrant count for the current passport. Never returns
   winner PII.
6. `06_verify.sql` — sanity selects.

## Storage path

```
event-assets/{agency_id}/{event_id}/awards/{uuid}.{ext}
```

Allowed types: jpg, jpeg, png, webp. 5 MB hard cap (bucket-level).

## Eligibility logic (in RPCs)

- Points: `coalesce(sum(participant_point_awards.points_awarded), 0)`
  for the passport in the event.
- All-locations: distinct `checkins.venue_id` per passport `>=` count of
  active, non-deleted venues for the event, AND active venue count
  `> 0`. If the event has no active venues, an award that requires all
  locations is **not eligible** for anyone.
- Award must be `status = 'active'` and `deleted_at is null`.
- Soft-deleted passports (`passports.deleted_at is not null`) are
  excluded from the draw pool.

## Rollback

```
drop function if exists public.get_public_event_awards(uuid, uuid);
drop function if exists public.get_event_award_draws_admin(uuid);
drop function if exists public.draw_event_award_winner(uuid);
drop function if exists public.delete_event_award(uuid);
drop function if exists public.save_event_award(uuid, uuid, text, text, text, integer, boolean, text, integer);
drop function if exists public.get_event_awards_admin(uuid);
drop table if exists public.event_award_draws;
drop table if exists public.event_awards;
-- (path_parts function: restore original logo/cover-only version from
--  supabase/migrations-draft-event-assets-storage/01_event_assets_bucket.sql)
```
