# Public recent activity RPC (draft)

Adds `public.get_public_event_recent_activity(_hostname, _limit)` used by
the public passport home page to render a rotating "Live Activity" bar.

Returns first names only (no email, no full name, no token). Read-only.
Safe for `anon`.

Apply `apply.sql` in the Supabase SQL editor. The UI hides the bar
gracefully until this is applied.
