# Leaderboard `c.entry_value` 42703 fix

## Problem

Production `public.get_public_leaderboard_by_domain(text)` errors with:

```
code:    42703
message: column c.entry_value does not exist
```

Root cause: the deployed function body matches
`migrations-draft-rewards-prize-draw/03_get_public_leaderboard_with_tiers.sql`,
which depends on `migrations-draft-rewards-prize-draw/01_qr_and_checkin_entry_value.sql`
to add `checkins.entry_value` and `venue_qr_codes.entry_value`. The 01
migration was never applied to production, so the function references a
column that doesn't exist.

## Chosen fix — Option 2 (smallest, beta-safe)

Replace the function with a compatibility version that:

- returns the same row shape as v3 (no client change needed)
- counts each check-in as 1 stamp / 1 point
- never references `c.entry_value` or `venue_qr_codes.entry_value`
- preserves SECURITY DEFINER, search_path, grants, and the privacy
  projection
- still honours `leaderboard_settings` (enabled, display_mode,
  show_first_name, show_last_initial, show_visit_count,
  hide_below_checkins, allow_visitor_opt_out)
- uses the default Bronze / Silver / Gold / Complete ladder based on the
  event's venue count, matching `src/lib/passport-rewards.ts`

This unblocks the public leaderboard without forcing the full
rewards/prize-draw schema live.

## Files

- `01_get_public_leaderboard_by_domain_no_entry_value.sql` — function
  definition only. No data changes. No new tables / columns / indexes.
  Idempotent: drops the function first, then re-creates it.

## Apply / rollback

Apply by pasting `01_*.sql` into the Supabase SQL editor. It runs inside a
`begin; … commit;` block.

Rollback = re-apply the previous definition (either v3 from
`migrations-draft-rewards-prize-draw/03` if `entry_value` is added later,
or v1 from `migrations-draft-public-leaderboard/01` for the original simple
shape). No data state to restore.

## Status

NOT applied. Awaiting approval.
