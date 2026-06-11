# Draft migration: surface venue points_value on the public venues RPC

Adds a `points_value` column to the return shape of
`public.get_public_venues_by_domain(text)` so the public Venues page can
render "earn N pts" / "N pts earned" on each venue card.

## Files

- `01_extend_public_venues_with_points.sql` — drops + recreates the RPC
  including `points_value integer` (coalesced to 0).

## Safety

- Existing offer-display columns are preserved.
- Existing callers that ignore the new column continue to work.
- No data is mutated; SECURITY DEFINER with explicit search_path retained.
- Grants restored to `anon, authenticated` after recreate.

## Apply

Apply after `migrations-draft-offer-display/02_extend_public_rpcs_offer_display.sql`.
