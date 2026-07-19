# Event `require_postcode` toggle + registration settings RPC

Adds an admin-controlled per-event flag that makes the postcode field
mandatory on the public join form, and exposes it to the public site
through a small dedicated RPC (`get_event_registration_settings`).

Apply `apply.sql` in the Supabase SQL editor. Safe / idempotent.

After applying:
- Admin → Event → **Registration form** shows a "Require postcode" toggle.
- Public join form marks postcode required and validates client-side.
- Admin → **Analytics** shows a new "Postcode breakdown" section with CSV export.
