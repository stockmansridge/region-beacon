# Event: require postcode on join form

Adds `events.require_postcode` (boolean, default false) and a small public
RPC `get_event_registration_settings(_hostname)` so the public join form can
read the flag without exposing the events table.

Apply `apply.sql` in the Supabase SQL editor.
