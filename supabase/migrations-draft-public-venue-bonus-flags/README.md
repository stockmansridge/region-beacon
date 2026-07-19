# Public venues-with-bonus flag RPC

Adds `public.get_public_venues_with_bonus(_hostname)` returning the set of
`venue_id`s for the current live event that have an active bonus
available. Used to render a small ⚡ bonus badge over each stamp tile on
the public passport home page.

Rules:
- If the event has any active event-wide bonus, every active venue is
  returned (all tiles show the badge).
- Otherwise only venues linked to an active per-venue bonus are
  returned.
- No tokens or PII are exposed.

## Apply

Run `apply.sql` in the Supabase SQL editor. Safe to re-run.
