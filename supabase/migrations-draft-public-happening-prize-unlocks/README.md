# Prize unlocks in public activity feeds

Extends two existing public RPCs so prize-unlock events surface alongside
venue check-ins:

- `get_public_event_happening_now` — adds `recent_prize_unlocks` (last 3,
  past 24h), and bumps `recent_checkins` from 5 → 15 so the client can
  group by venue.
- `get_public_event_recent_activity` — merges prize-unlock rows into the
  ticker feed used by the live activity bar. Prize rows populate
  `award_title` (venue_name is null), so the client renders them with a
  🎉 emoji and an "unlocked …" message.

## Apply

Paste `apply.sql` into the Supabase SQL editor and run.

## Rollback

Re-apply the previous versions from
`supabase/migrations-draft-public-happening-now/apply.sql` and
`supabase/migrations-draft-public-recent-activity/apply.sql`.
