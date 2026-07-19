# Admin: delete event participant

Adds `public.admin_delete_event_participant(p_event_id uuid, p_passport_id uuid)`.

Lets an agency admin (or platform admin) hard-delete a single participant
from an event: check-ins, consents, point awards, passport, and visitor row.

Refuses deletion if the passport is recorded as a prize draw winner
(`public.prize_draw_results`) so audit history is preserved.

## Apply

Paste `apply.sql` into the Supabase SQL editor for the production project
and run it. Safe to re-run.
