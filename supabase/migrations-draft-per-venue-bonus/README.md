# Per-venue bonus codes

Adds an optional per-venue mode to `public.event_bonus_codes`.

## What it does

- Adds `event_bonus_codes.scope text` (`'event'` | `'per_venue'`, default `'event'`).
- Adds `public.event_bonus_code_venues` — one row per (bonus, participating venue) with its own `qr_code_token`.
- New RPC `save_per_venue_bonus_venues(_bonus_code_id, _venue_ids uuid[])` — syncs the venue selection: activates missing rows (with a fresh token), and soft-deactivates rows for venues no longer selected (history + tokens are preserved so historical claims remain valid references).
- Extends `claim_bonus_code(_token, _passport_token)` to resolve either an event-wide token OR a per-venue token. Points are awarded at the parent bonus's full `points_value`. Uniqueness is enforced via the existing `(event_id, participant_id, award_type, source_id)` index — `source_id` becomes the child row id for per-venue claims, so a customer can claim once per (bonus, venue).
- Extends `get_public_event_bonus_challenges` with an optional `_venue_id uuid`. Event-wide bonuses always return; per-venue bonuses return only when a matching venue id is passed (`is_claimed` is scoped to that specific venue).

## Apply

Run `apply.sql` in the Supabase SQL editor. Safe to re-run.

## Rollback

```sql
begin;
drop function if exists public.save_per_venue_bonus_venues(uuid, uuid[]);
drop table if exists public.event_bonus_code_venues;
alter table public.event_bonus_codes drop constraint if exists event_bonus_codes_scope_check;
alter table public.event_bonus_codes drop column if exists scope;
-- Then re-run the previous claim_bonus_code / get_public_event_bonus_challenges
-- bodies from supabase/migrations-prod-claim-bonus-code-final-ambiguous-fix/apply.sql
-- and supabase/migrations-draft-public-bonus-challenges/apply.sql.
commit;
```
