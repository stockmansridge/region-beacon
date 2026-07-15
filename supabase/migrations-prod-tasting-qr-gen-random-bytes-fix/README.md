# Prod fix — Tasting QR create fails: `gen_random_bytes(integer) does not exist`

## Symptom

Creating a Tasting QR under a venue shows:

```
function gen_random_bytes(integer) does not exist
```

## Cause

`public.save_venue_tasting_qr_code` is declared `set search_path = public`,
but pgcrypto is installed in the `extensions` schema. The unqualified
`gen_random_bytes(24)` call in the token-mint branch cannot be resolved.
Same class of issue already fixed for `rotate_venue_qr` and
`register_visitor`.

## Fix

`apply.sql` re-creates `save_venue_tasting_qr_code` with the call
qualified as `extensions.gen_random_bytes(integer)`. Nothing else
changes — same signature, same returned row, same plan-gate, same
validations. Safe to re-run.

## Apply

Run `apply.sql` in the Supabase SQL editor (same channel as the other
`migrations-prod-*` folders). Lovable can't execute DDL against your
externally-managed Supabase from the sandbox.

## Verify

Open a venue → Tasting QR tab → fill in Label / Points → **Create**.
The row should insert and the new QR should appear in the list, no
error toast.
