# Passport stamps RPC (DRAFT)

Adds `public.get_passport_stamps_by_token(_raw_token text)` for the
`/passport/$token` page.

## RPC inspection summary

Existing `public.get_passport_by_token(_raw_token)` returns owner identity +
`checkin_count` only. It does NOT return:

- stamped venue list
- total venue count
- per-venue check-in time
- venue logos/covers
- venue labels

`public.redeem_checkin(...)` is write-only. There is no existing RPC that
returns the stamped venue list for a passport.

## What this draft adds

One new RPC, additive, SECURITY DEFINER, search_path-pinned:

`get_passport_stamps_by_token(_raw_token text) returns table (...)`

Returns one row per active venue in the passport's event, with:

- `passport_id`, `event_id`, `event_name`
- `venue_label_singular`, `venue_label_plural` (config or defaults)
- `total_venues`, `stamped_count` (repeated per row — single roundtrip)
- `venue_id`, `venue_name`, `venue_logo_path`, `venue_cover_path`
- `order_index`
- `is_stamped`, `checked_in_at` (first check-in time for that venue)

Stamped venues sort first by earliest check-in; remaining venues follow by
`order_index`.

## Privacy model

- Caller must know the raw access token (same gate as
  `get_passport_by_token`). Bad/empty token → zero rows.
- Returns only this passport's own check-in timestamps.
- Never returns other visitors' data, QR tokens, raw access tokens,
  billing data, or admin-only fields.
- Inactive / soft-deleted venues are excluded.

## Apply

```
psql ... -f 01_get_passport_stamps_by_token.sql
```

Not executed by the assistant. Apply manually on staging when approved.
