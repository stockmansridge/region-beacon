# Release subdomains of deleted events

Lets archived/deleted events release their `event_domains.public_subdomain`
so a new event can reuse the same label (e.g. `orange-wine-trail`).

## What this changes

1. **Trigger `tg_release_event_subdomains_on_archive`** on `public.events`.
   When `deleted_at` transitions NULL → not-NULL, every linked
   `event_subdomain` row is updated to `public_subdomain = NULL`,
   `status = 'revoked'`, `is_primary = false`. The label drops out of the
   `ux_event_domains_subdomain` partial unique index and becomes free.
2. **Backfill** — runs the same release for every already-archived event.
3. **`validate_public_subdomain(text)`** — joins to `events` and ignores
   subdomains that belong to soft-deleted events (defence in depth).
4. **`system_admin_clear_event_subdomain(p_event_id uuid)`** — platform
   admin RPC to manually clear the subdomain of a deleted event.
5. **`system_admin_deleted_events_with_subdomain()`** — read RPC that
   feeds the new "Released subdomains" cleanup section in System Admin →
   Events.

Public lookup (`resolve_event_by_host`) is unchanged: it already filters
`events.status = 'published'`, and archived events have
`status = 'archived'`, so they never resolved publicly to begin with —
the only outstanding bug was the unique-index occupancy that blocked
reuse, which this migration fixes.

## How to run

1. Open the Supabase SQL editor for the production project.
2. Paste `apply.sql` and run. Safe to re-run.

## Verify

```sql
-- Archive an event and confirm the label is freed.
update public.events
   set deleted_at = now(), status = 'archived'
 where id = '<event-uuid>';

select public_subdomain, status
  from public.event_domains
 where event_id = '<event-uuid>'
   and domain_type = 'event_subdomain';
-- expect: public_subdomain = NULL, status = 'revoked'

select * from public.validate_public_subdomain('<freed-label>');
-- expect: ok = true
```
