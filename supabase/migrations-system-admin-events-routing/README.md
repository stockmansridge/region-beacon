# System Admin events routing + archive controls

Extends the System Admin → Events screen with:

1. **`system_admin_events()`** now returns `public_subdomain`, `custom_domain`,
   `subdomain_status`, and `deleted_at`, and includes archived events
   (front-end filters by `status`). The "primary" domain row per event is
   chosen by `is_primary desc, updated_at desc`.
2. **`system_admin_active_events_with_subdomain()`** lists every
   non-archived event that currently holds a `public_subdomain`, so a
   platform admin can identify the owner of a label before reusing it.
3. **`system_admin_archive_event(p_event_id uuid)`** — platform-admin RPC
   that sets `events.deleted_at = now()` and `status = 'archived'`. The
   existing `trg_release_event_subdomains_on_archive` trigger frees the
   subdomain automatically.
4. **`system_admin_unarchive_event(p_event_id uuid)`** — restores the event
   as a draft. Does NOT restore the freed subdomain; it may already be
   claimed by another event.

All RPCs gate on `public._require_platform_admin()`. Idempotent.

## Apply

```bash
psql "$DATABASE_URL" -f supabase/migrations-system-admin-events-routing/apply.sql
```

Or paste into the Supabase SQL editor.
