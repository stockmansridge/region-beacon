# Public "What's Happening Now" RPC (draft)

Adds `public.get_public_event_happening_now(_hostname)` used by the public
event home page to render the "What's Happening Now" card.

Returns a JSONB bundle:

- `recent_checkins`: up to 5 most recent check-ins in the last 24h
  (first name + last initial + venue name + timestamp).
- `explorers_today`: distinct passports with at least one check-in
  since local midnight (in the event's timezone, UTC fallback).
- `recent_bonus`: up to 3 most recent bonus-code claims in the last 24h
  (first name + bonus code name + points awarded).

No email, full name, or passport token exposed. Safe for `anon`.

Apply `apply.sql` in the Supabase SQL editor. The UI hides the card
gracefully until this is applied.
