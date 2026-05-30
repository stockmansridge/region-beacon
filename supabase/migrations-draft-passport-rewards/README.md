# Passport rewards RPC (draft)

Adds `public.get_passport_rewards_by_token(_raw_token text)` so the
`/passport/{token}` screen can display the owner's tier + points using the
same logic as the public leaderboard.

## Status

DRAFT. Not executed. Review before applying to staging.

## Why

The public leaderboard now exposes `tier`, `points`, and `is_completed`.
The passport screen still shows only stamp-count-based progress. This RPC
closes that gap while keeping the passport-token trust model untouched.

## Signature

```
get_passport_rewards_by_token(_raw_token text) returns table (
  passport_id           uuid,
  event_id              uuid,
  stamps                int,
  points                int,
  total_venues          int,
  tier                  text,
  is_completed          boolean,
  venue_label_singular  text,
  venue_label_plural    text
)
```

## Privacy model

- Resolves the passport by `digest(_raw_token,'sha256') = access_token_hash`.
- Returns the owner's aggregate row only — never other visitors, other
  passports, QR tokens, `access_token_hash`, admin data, or billing data.
- No PII (email, phone, name) is projected.
- `SECURITY DEFINER` + `search_path=public`; granted to `anon, authenticated`
  consistent with the other passport-token RPCs.
- Bad / empty / unknown token → zero rows (no error leak).

## Tier resolution

Identical ladder to `get_public_leaderboard_by_domain`:

1. If active `reward_rules` of type `min_checkins` exist for the event,
   pick the highest satisfied `threshold`'s `reward_label`.
2. Otherwise default ladder: Bronze (3), Silver (5),
   Gold (`min(8, total_venues)`), Complete (`total_venues`).

`is_completed = (total_venues > 0 and stamps >= total_venues)`.

## Apply

```
psql "$DATABASE_URL" -f 01_get_passport_rewards_by_token.sql
```

## Verify

```sql
-- Returns one row for a valid token, zero rows for an unknown token.
select * from public.get_passport_rewards_by_token('<raw token>');
select * from public.get_passport_rewards_by_token('not-a-real-token');
```

Compare with the leaderboard row for the same passport — `tier`, `points`,
`stamps` must match.

## Rollback

```sql
drop function if exists public.get_passport_rewards_by_token(text);
```
