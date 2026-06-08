# System Admin: hard delete event + days_since_archived

Adds a platform-admin-only permanent delete for already-archived events and a
`days_since_archived` field on `system_admin_events()`.

## Behaviour

- `system_admin_events()` returns a new `days_since_archived int` column
  (`null` for non-archived events; `0` for events archived earlier today).
- `system_admin_hard_delete_event(p_event_id uuid)`:
  - Gated by `public._require_platform_admin()`.
  - Refuses to run unless `events.deleted_at is not null` (event already archived).
  - Clears `event_domains`, then deletes from RESTRICT-blocked dependents
    (`checkins`, `visitor_consents`, `visitors`, `event_terms_versions`,
    `export_logs`) when present, then deletes the `events` row. Remaining
    children (venues, passports, branding, faq, awards, points, prize draw,
    leaderboard settings, checkin settings, reward/prize rules, activations)
    cascade.
  - Does NOT touch agencies, auth.users, agency_members, billing
    subscriptions, or other events in the same organisation. `billing_events`
    rows are preserved via existing `ON DELETE SET NULL`.
  - Returns `{ success, event_id, event_name, agency_id, deleted: {...counts} }`.

## Apply

```bash
psql "$DATABASE_URL" -f supabase/migrations-system-admin-hard-delete-event/apply.sql
```

Or paste into the Supabase SQL editor.
