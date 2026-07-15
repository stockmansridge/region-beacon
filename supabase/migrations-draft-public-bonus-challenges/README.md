# Public bonus challenges RPC

Adds `public.get_public_event_bonus_challenges(_hostname, _passport_token)`
so the public venue detail page (`/live/$subdomain/venues/$venueId`) can
render a "Bonus Challenge" block under the Offer bubble whenever the
event has one or more active bonus codes.

## Shape

Returns one row per active bonus code, ordered by `created_at`:

- `bonus_code_id`
- `name`
- `description`
- `points_value`
- `is_claimed` — `true` when the supplied passport token has already
  claimed this bonus (matches `participant_point_awards` where
  `award_type='bonus'` and `source_id = bc.id`). `false` when no passport
  token is supplied or the passport hasn't claimed it yet.

The bonus `qr_code_token` is intentionally not exposed. Collection still
happens through the existing `/collect/bonus/:token` flow which calls
`public.claim_bonus_code`.

## Auth

`security definer`, grants execute to `anon` and `authenticated`. The
per-passport claimed status is resolved server-side via
`extensions.digest(_passport_token, 'sha256')` — mirroring
`claim_bonus_code` — so anonymous callers only ever see `is_claimed =
false`.

## Apply

Run `apply.sql` in the Supabase SQL editor. Safe to re-run
(`create or replace`).
