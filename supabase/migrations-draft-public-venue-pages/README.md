# Public venue pages — draft only

DO NOT execute against production. Review and apply to STAGING after approval.

## Why

The existing `public.get_public_event_venues(_event_id uuid)` (see
`supabase/migrations-draft/32_rpcs_public.sql:165`) returns only
`venue_id, name, address, lat, lng, order_index`. It also uses the legacy
`e.status = 'published'` gate rather than the new publishable gate baked
into `public.resolve_event_by_host`.

The new venue public profile fields (`description`, `website_url`, `phone`,
`logo_path`, `cover_path`) — added by
`supabase/migrations-draft-venue-public-pages/01_venues_public_page_fields.sql`
— are NOT exposed by any existing public RPC. Frontend code MUST NOT read
`public.venues` directly because RLS scopes it to agency members only.

## What this draft adds

Two new SECURITY DEFINER RPCs, keyed by hostname so they share the
publishing gate semantics of `resolve_event_by_host`:

1. `public.get_public_venues_by_domain(_hostname text)` — list view.
2. `public.get_public_venue_by_domain(_hostname text, _venue_id uuid)` —
   detail view.

Both return ONLY the safe public-profile columns:

- `venue_id`
- `name`
- `description`
- `address`
- `website_url`
- `phone`
- `logo_path`
- `cover_path`
- `lat`, `lng` (already public via the legacy RPC and the visitor map)
- `order_index`

Plus a single sentinel column `event_found boolean` on the list RPC so the
client can distinguish "no venues yet" from "event not live / unknown
host". The detail RPC simply returns zero rows if the host doesn't resolve
or the venue isn't visible.

Never exposed:

- QR tokens or `venue_qr_codes` rows of any kind
- visitor / passport / checkin data
- agency, billing, audit, or admin fields
- internal `status`, `deleted_at`, `created_by`, timestamps

## Filtering

- Host must resolve to `kind = 'event'` via `resolve_event_by_host`
  (which already enforces publishing gate).
- Only `venues.status = 'active'` AND `venues.deleted_at is null`.
- Ordered by `order_index`, then `name`.

## Slugs?

Open question: do public venue detail pages need readable slugs
(`/live/<sub>/venues/cellar-door`) instead of UUIDs?

Recommendation: **not now**. UUIDs are fine for v1. A `venues.public_slug`
column with a per-event unique index would be a clean follow-up if we want
shareable URLs, but it adds:

- a new column + unique index migration
- slug generation/validation in admin
- back-compat redirect handling

That work is out of scope for this draft. No slug column is added here.

## Files

- `01_get_public_venues_by_domain.sql` — both RPCs + grants.
- `02_verify.sql` — manual smoke tests.

## Apply order

Must be applied AFTER:

1. `supabase/migrations-draft-venue-public-pages/01_venues_public_page_fields.sql`
2. `supabase/migrations-draft-publishing-gate/01_resolve_event_by_host_publishable.sql`
   (already on staging)

If the venue public-profile columns are not yet present, this script will
fail with `column "description" does not exist` etc.
