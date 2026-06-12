# Prod migration — redeem_checkin (consolidated final)

**Apply this one file. Ignore the two earlier folders** — they were applied
out of order and the points patch reverted the summary patch's return shape.

## Root cause

`migrations-prod-redeem-checkin-points/apply.sql` was applied after
`migrations-prod-redeem-checkin-summary/apply.sql`. The points patch kept
the old 4-column `returns table (...)` definition, so it dropped and
recreated `public.redeem_checkin` with the original shape — silently
removing `venue_name`, `points_awarded`, and `already_checked_in`. The
frontend then fell back to "Stamp added at this venue." because both
fields came back undefined.

## Fix

`apply.sql` in this folder is the single source of truth. It:

- drops the exact existing signature `public.redeem_checkin(text,text,inet,text)`
- recreates it with the 7-column return shape
- preserves every prior fix (pgcrypto, schema-qualified `extensions.digest`,
  entry_value snapshot, ledger insert with `award_type='venue'`,
  idempotent on the existing partial unique index)
- re-grants EXECUTE to `anon` and `authenticated`
- runs in a single transaction; safe to re-run

## After apply

```sql
select pg_get_function_result(
  'public.redeem_checkin(text,text,inet,text)'::regprocedure
);
-- must show: TABLE(checkin_id uuid, venue_id uuid, passport_id uuid,
--                  is_new boolean, venue_name text, points_awarded integer,
--                  already_checked_in boolean)
```

Then rescan a fresh venue QR on mobile — success screen should read
"You earned N point(s) at <Venue Name>."

No frontend change required — `src/routes/checkin.$qrToken.tsx` already
reads the new fields.
