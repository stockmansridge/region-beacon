# Prod fix — `claim_bonus_code` missing `digest()`

## Symptom

Customer scanning a bonus QR at `/collect/bonus/:token` sees:

```
Something went wrong
function digest(text, unknown) does not exist
```

(SQLSTATE 42883)

## Cause

`public.claim_bonus_code(_token, _passport_token)` was previously fixed
in `migrations-prod-claim-bonus-code-ambiguous-fix/apply.sql`, but that
version still calls `digest(_passport_token, 'sha256')` unqualified.
`pgcrypto` is installed under the `extensions` schema on this Supabase
project, and the function's `search_path` is `public`, so `digest()` is
not resolvable at runtime and the RPC aborts before the passport
lookup.

Every other passport-token RPC (`redeem_checkin_*`,
`qr_entry`, `get_venue_tasting_qr_codes`, etc.) already calls
`extensions.digest(...::text, 'sha256'::text)` for this exact reason.

## Fix

`apply.sql` re-creates the function identical to the ambiguous-fix
version but with the passport lookup schema-qualified:

```sql
where pp.access_token_hash = extensions.digest(_passport_token::text, 'sha256'::text);
```

No other behaviour change. Same signature, same output shape. Safe to
re-run (`create or replace`).

## Apply

Run `apply.sql` against the production Supabase database via the
Supabase SQL editor. The Lovable agent cannot execute DDL against this
externally managed Supabase project from the sandbox.

## Verify

Scan a bonus QR at `/collect/bonus/<token>` while signed into a
passport. Expected: the collect page shows either "Bonus points
collected" or "Already collected" instead of the 42883 error page.
