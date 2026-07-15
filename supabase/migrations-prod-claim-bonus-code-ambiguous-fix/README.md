# Prod fix — `claim_bonus_code` ambiguous `event_id`

## Symptom

Customer scanning a bonus QR code at `/collect/bonus/:token` sees:

```
Something went wrong
column reference "event_id" is ambiguous
```

(SQLSTATE 42702)

## Cause

`public.claim_bonus_code(_token, _passport_token)` declares
`RETURNS TABLE (... event_id uuid, ...)`. That OUT column is an implicit
PL/pgSQL variable inside the body and collides with the `event_id`
column on `public.passports` and `public.participant_point_awards`
referenced by several statements (the passport `SELECT` list and the
final totals `WHERE`). Same pattern already fixed for
`get_public_event_awards`, `get_venue_tasting_qr_codes`, and
`draw_event_award_winner`.

## Fix

`apply.sql` re-creates the function with:

- The bonus-code record's `event_id` aliased to `b_event_id` and the
  passport record's `event_id` aliased to `p_event_id`, so nothing in
  the body refers to a bare `event_id` that could be read as the OUT
  column.
- All references to `participant_point_awards` and `passports` fully
  qualified via table aliases (`pp.`, `ppa.`).
- `v_inserted` widened to `bigint` — `GET DIAGNOSTICS ... = ROW_COUNT`
  returns `bigint`; the previous `boolean` type was already a latent
  bug (would raise `cannot cast bigint to boolean` if it ever ran past
  the ambiguity error).

No behaviour change. Same signature, same output shape. Safe to re-run
(`create or replace`).

## Apply

Run `apply.sql` against the production Supabase database via the same
channel used by the other `migrations-prod-*` folders (Supabase SQL
editor). The Lovable agent cannot execute DDL against this externally
managed Supabase project from the sandbox.

## Verify

1. Open a bonus QR code as a customer while holding a passport for the
   same event → confirm the points are awarded and the success card
   renders (no red error card).
2. Re-scan the same QR → confirm the "already collected" message.
3. Scan while holding a passport from a different event → confirm the
   "different event" message.
