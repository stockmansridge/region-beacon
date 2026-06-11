# Venue asset uploads — RLS fix

Run `apply.sql` in the Supabase SQL editor.

## Root cause
`public.event_assets_path_parts(text)` in production only recognises the
4-segment event-level path shape (`{agency}/{event}/{logo|cover|map|awards}/{file}`).
The venue editor uploads to the 6-segment shape
`{agency}/{event}/venues/{venue}/{logo|cover}/{file}` (see
`src/lib/venue-assets.ts → buildVenueAssetPath`). The old parser returns
NULL for venue paths, so `can_write_event_asset` fails closed and the
`storage.objects` INSERT policy raises
`new row violates row-level security policy`.

## What the migration does
1. Recreates `event_assets_path_parts` to recognise both 4-segment
   event-level and 6-segment venue-level paths (returning `venue_id`
   when present).
2. Recreates `can_write_event_asset` to additionally verify that the
   referenced venue exists, is not soft-deleted, and belongs to the
   same event before allowing the write.
3. Re-grants EXECUTE on both helpers.

`storage.objects` policies are not touched — they already gate on
`public.can_write_event_asset(name)` and pick up the new logic
automatically.

## Acceptance
- Event-level logo / cover / map / awards uploads continue to work.
- Venue logo upload (`…/venues/{venue}/logo/…`) succeeds for agency
  owner / admin and platform admin.
- Venue cover/hero upload (`…/venues/{venue}/cover/…`) succeeds for
  the same roles.
- Public GET on `event-assets` continues to work (read policy unchanged).
- Non-admins still cannot write venue assets.
