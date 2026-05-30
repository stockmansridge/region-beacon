# Event Announcements — Draft Migration

Status: DRAFT ONLY. No SQL has been executed. No production touched. No UI
changes yet (Parts 2 + 3 pending explicit approval).

## Why

Each event needs a customer-facing announcement bar at the top of the public
`/live/$subdomain` pages to surface winners, weather warnings, schedule
changes, bonus promotions, etc. without code changes.

## Existing schema check

Searched `supabase/` and `docs/` for any pre-existing announcement / notice
table — none found. (Matches in other files were unrelated context
references, not table definitions.) Safe to add a new table.

## Files

- `01_event_announcements.sql`
  - Creates `public.event_announcements`.
  - Columns per spec: id, agency_id, event_id, title, message, tone
    (info/success/warning/urgent), link_label, link_url, starts_at,
    ends_at, is_active, created_by, created_at, updated_at.
  - Composite FK `(agency_id, event_id) → events(agency_id, id)` enforces
    tenant integrity (agency_id must match the event's agency).
  - Indexes: `(event_id, is_active)`, partial `(event_id, starts_at, ends_at)`.
  - `tg_set_updated_at` trigger.
  - Grants: `authenticated` (CRUD), `service_role` (all). **No anon grant.**
  - RLS enabled. Policies:
    - `deny_all` (restrictive default)
    - `platform_admin_all` — platform admins, full
    - `agency_admin_manage` — `agency_owner` + `agency_admin`, full
    - `agency_member_read` — any accepted agency member (incl. staff), select only

- `02_get_public_event_announcements_by_domain.sql`
  - Public RPC `public.get_public_event_announcements_by_domain(_hostname text)`.
  - `SECURITY DEFINER`, `search_path = public`, `stable`.
  - Uses `public.resolve_event_by_host()` (which already enforces the
    publishing/billing gate) — unpublished events return zero rows.
  - Returns only `title, message, tone, link_label, link_url`.
  - Filters: `is_active = true` AND now() within `[starts_at, ends_at]`.
  - Ordering: urgent → warning → success → info, then `updated_at desc`.
  - Granted to `anon, authenticated`.

- `03_verify.sql` — post-apply verification queries (RLS on, policies
  present, anon direct read denied, unknown-host RPC returns 0 rows,
  scheduled windows respected, returned columns limited to safe set).

## Public safety model

| Concern | Mitigation |
|---|---|
| Cross-tenant leakage | Composite FK + RLS scoped via `is_agency_admin`/`is_agency_member`. |
| Direct anon read | No anon grant + restrictive RLS; only the RPC is callable. |
| Unpublished event leakage | RPC gates on `resolve_event_by_host` which enforces publishing/billing. |
| PII leakage | Table holds no visitor / billing data; RPC `RETURNS TABLE` whitelists 5 columns. |
| Stale / future announcements | `is_active` + `starts_at`/`ends_at` window enforced in RPC. |
| Malicious link injection | `link_url` CHECK enforces `^https?://`. Frontend should still render via safe `<a rel="noopener noreferrer" target="_blank">`. |

## Test plan (after staging apply)

1. Run `03_verify.sql` block by block; confirm:
   - table + columns + constraints exist
   - RLS enabled, 4 policies present
   - anon `select * from public.event_announcements` is denied
   - `get_public_event_announcements_by_domain('garbage')` returns 0 rows, no error
2. As an `agency_admin` user, insert an active announcement for one of
   their events; confirm it appears via the RPC when called with that
   event's live host.
3. As `agency_staff`, attempt insert/update → denied. Select → allowed.
4. As an unrelated agency's admin, attempt insert/select on row from
   agency A → denied.
5. Insert an announcement with `starts_at = now() + 1 day` → RPC excludes
   it. Update `starts_at` to now() → RPC includes it.
6. Set `is_active = false` → RPC excludes it.
7. Confirm an unpublished/draft event's announcements are NOT returned by
   the public RPC.

## Rollback

```
drop function if exists public.get_public_event_announcements_by_domain(text);
drop table    if exists public.event_announcements cascade;
```

## NOT in this draft

- No admin UI in `/admin/events/$eventId` (Part 2, pending approval).
- No public announcement bar component on `/live/...` routes (Part 3, pending approval).
- No SQL executed. No production changes. No QR / check-in changes.
- No service role keys exposed.
- No Stripe, Apple Maps, or visitor data touched.
