# GetStampd Venue Limit Enforcement (Draft Migration)

This folder contains a **draft** SQL migration that enforces GetStampd's
venue-based plan limits at the database level. It is **not** applied
automatically — apply it manually only when you are ready to enforce plan
limits beyond the front-end soft guard.

## Files

- `01_getstampd_venue_limits.sql` — creates `get_agency_plan_limits()` and the
  `enforce_agency_venue_limit()` trigger on `public.venues`.
- `02_upgrade_requests.sql` — creates `public.upgrade_requests` table for the
  customer-facing upgrade request flow (Account & Billing → "Request plan
  upgrade"). Reviewed manually by platform admins; does not touch
  `agency_subscriptions` or billing. RLS lets org owners/admins insert and
  read their own organisation's requests; platform admins can read and update
  all rows.

## What it does

- Adds `public.get_agency_plan_limits(_agency_id uuid)` returning a `jsonb`
  payload with `plan_code`, `venue_limit`, `active_event_limit`, and
  `passport_limit` based on the latest active subscription in
  `agency_subscriptions` (`status` in `active`, `trialing`, `comp`).
- Adds a `BEFORE INSERT OR UPDATE` trigger on `public.venues` that blocks
  creating or restoring a venue when the organisation is already at its
  plan's venue limit.
- The trigger is created idempotently (drop-if-exists then create).

## Plan limits

| Plan        | Venues | Active events | Passports |
|-------------|--------|---------------|-----------|
| free        | 5      | 1             | 250       |
| starter     | 10     | 1             | 1,000     |
| growth      | 25     | 3             | 3,000     |
| regional    | 50     | 5             | 7,500     |
| pro_region  | 100    | 10            | 15,000    |
| enterprise  | ∞      | ∞             | ∞         |

- Organisations with no active subscription default to **Free**.
- Unknown plan codes also fall back to **Free**.
- Both `pro-region` and `pro_region` are accepted.
- **Enterprise** has no venue limit (`null`) and is never blocked.

## Trigger behaviour

- Only enforces when `NEW.deleted_at IS NULL` (archived/deleted venues are
  not counted and not enforced on archive).
- Counts active venues organisation-wide (`agency_id = NEW.agency_id AND
  deleted_at IS NULL`).
- On `UPDATE`, the current row is excluded from the count so editing an
  existing active venue is never blocked — even when already at the limit.
- Restoring an archived/deleted venue (setting `deleted_at` back to null) is
  blocked if it would push the active count over the limit.
- Inserting a new active venue is blocked when already at the limit.

## When to apply

Apply this migration once you are ready to enforce plan limits server-side.
The front end already has a soft guard in `admin.events.$eventId.tsx`, but
that guard can be bypassed by direct API calls. This migration closes that
gap.

## When NOT to apply

- Do not apply before customers on legacy/grandfathered configurations have
  been reviewed — the trigger will block their next insert if they are over
  limit.
- Do not apply if you need a "warn but allow" period; the trigger raises a
  hard exception.

## What this migration does NOT do

- It does **not** implement Stripe checkout or change any billing status.
- It does **not** modify or rewrite existing rows in `venues`,
  `agency_subscriptions`, or any other table.
- It does **not** alter the schema of any existing table (no `ALTER TABLE`).
- It does **not** enforce `active_event_limit` or `passport_limit` — only
  `venue_limit` is enforced here. Those limits are returned by
  `get_agency_plan_limits()` for future use.

## How to apply (manual)

Run `01_getstampd_venue_limits.sql` against the GetStampd Supabase project
(`kyjwifumacnrpgyextzz`) via the SQL editor or your migration tool of choice.
The SQL is idempotent — running it again is safe.

## How to roll back

```sql
drop trigger if exists trg_enforce_agency_venue_limit on public.venues;
drop function if exists public.enforce_agency_venue_limit();
drop function if exists public.get_agency_plan_limits(uuid);
```
