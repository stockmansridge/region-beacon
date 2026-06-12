# Production fix: `venue_qr_codes.entry_value` missing

## Problem

Mobile QR scan check-in fails with:

    code 42703 — column qr.entry_value does not exist

The `redeem_checkin` RPC running in production references
`qr.entry_value`, but the production `venue_qr_codes` table never had
the column added — the draft migration in
`migrations-draft-rewards-prize-draw/01_qr_and_checkin_entry_value.sql`
was never applied.

## Fix

`apply.sql`:

1. Adds `venue_qr_codes.entry_value int not null default 1` (idempotent).
2. Adds `checkins.entry_value int not null default 1` (idempotent).
3. Adds `entry_value BETWEEN 1 AND 100` CHECK constraints on both.
4. Backfills any NULLs to 1.
5. Recreates `redeem_checkin` with `COALESCE(qr.entry_value, 1)` and
   fully-qualified column refs (avoids future ambiguity errors).
6. Re-grants execute to `anon, authenticated`.

Existing organiser save paths already write `entry_value` via the
admin RPCs/RLS already in place for `venue_qr_codes`, so no policy
changes are required.

## Apply

Run `apply.sql` in the Supabase SQL editor. Safe to re-run.

## Verify

See the SQL block at the bottom of `apply.sql`.
