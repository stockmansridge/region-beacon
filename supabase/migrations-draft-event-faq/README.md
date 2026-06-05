# Event FAQ / Info entries

Adds the `event_faq_entries` table plus a public-safe RPC for reading
entries by host.

Apply order:

1. `01_event_faq_entries.sql` — table, indexes, RLS, grants.
2. `02_get_public_event_faq_by_domain.sql` — public RPC.

Same RLS posture as `event_announcements`:

- default deny
- platform_admin: full manage
- agency owner/admin: manage rows for events in their agency
- agency staff: read-only
- public callers only see entries via `get_public_event_faq_by_domain`,
  which goes through `resolve_event_by_host` so it respects the
  publishing/billing gate.

Rollback in reverse order (drop function, then drop table).
