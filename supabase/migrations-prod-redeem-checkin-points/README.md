# Production fix: venue check-ins now award points

## Problem

`redeem_checkin` was inserting into `public.checkins` and snapshotting
`entry_value`, but it never wrote a row to `public.participant_point_awards`.
The leaderboard (`get_public_leaderboard_by_domain`) and rewards summary
(`get_event_participant_points`) both read points exclusively from
`participant_point_awards`, so stamps incremented while points stayed at 0.

## Fix

`apply.sql` recreates `public.redeem_checkin` so a successful first-time
venue check-in also inserts into `participant_point_awards` with:

- `award_type = 'venue'` — already the value the leaderboard & rewards
  RPCs filter on, and the only venue value allowed by
  `participant_point_awards_type_check`.
- `source_id = venue_id` — combined with the existing partial unique
  index `participant_point_awards_unique_source` this makes the insert
  idempotent across retries / races.
- `points_awarded = COALESCE(qr.entry_value, 1)` (clamped 1..100).

Return signature, parameter list, duplicate-checkin behaviour, rate
limit, tenant integrity, and `digest()` schema-qualification are all
unchanged, so no frontend changes are required.

## Apply

Run `apply.sql` in the Supabase SQL editor. Safe to re-run.

## Source of truth

- **Leaderboard points:** `participant_point_awards` via
  `get_public_leaderboard_by_domain` (point_counts CTE).
- **Rewards / passport points:** `participant_point_awards` via
  `get_event_participant_points`.

Both surfaces are now fed by this same insert.

## Verification

See the SQL block at the bottom of `apply.sql`.
