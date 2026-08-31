# Event page views

Run `apply.sql` in the production SQL editor.

It creates:

- `public.event_page_views` — one row per public event page view
  (`event_id`, `path`, opaque `device_id`, `created_at`). No PII, no IP, no
  user agent.
- `public.record_event_page_view(uuid, text, text)` — SECURITY DEFINER RPC
  called by anonymous browsers. Derives `agency_id` from the event so it
  cannot be spoofed, and silently ignores unknown/deleted events.

RLS: default deny, platform admins full access, agency members read-only.
Analytics reads the table directly with the agency filter.

Until the SQL is applied, the Analytics "Page views" card shows zeros and
tracking calls fail silently.
