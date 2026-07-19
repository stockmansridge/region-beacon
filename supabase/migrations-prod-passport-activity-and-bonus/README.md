# Passport: activity feed + venue bonus badges

The private passport page (`/passport/:token`) shows:
- a "What's Happening Now" card under the stamp grid, and
- a small bonus badge on each stamp tile when a venue has an active bonus.

Both features depend on two public RPCs that only existed as drafts:

- `public.get_public_event_happening_now(_hostname text)`
- `public.get_public_venues_with_bonus(_hostname text)`

Without them the client requests fail and the UI silently hides both.

## Apply

Run `apply.sql` in the Supabase SQL editor for the production project. Safe
to re-run (create-or-replace + idempotent grants). No table changes.
