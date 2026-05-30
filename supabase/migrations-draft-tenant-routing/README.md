# Tenant routing — draft migrations (NOT APPLIED)

These migrations add the minimum DB surface for wildcard agency subdomain
routing (`{agencySlug}.getstampd.com`) and public event resolution
(`{agencySlug}.getstampd.com/e/{eventSlug}`).

**Status**: drafts only. Nothing here has been applied to staging or
production. Review, then run via the migration tool when you're ready.

## What changes

- Adds two SECURITY DEFINER RPCs, both `STABLE` and projected to safe
  public columns only:
  - `public.resolve_agency_by_subdomain(_sub text)` — returns
    `(agency_id uuid, name text, slug text, logo_url text)` or empty set.
    Rejects reserved subdomains (mirrors the client-side list in
    `src/lib/reserved-subdomains.ts`).
  - `public.get_public_event_by_agency_and_slug(_sub text, _event_slug text)` —
    returns the same shape as the existing `get_public_event_by_domain`,
    filtered by `agencies.slug` + `events.public_slug` and
    `is_published = true`.
- Adds a CHECK constraint on `agencies.slug` enforcing the same shape the
  client validates (lowercase, URL-safe, ≤63 chars).

## What does NOT change

- No new tables, no new columns.
- No changes to RLS on `agencies`, `events`, `event_domains`, or any other
  table. Both RPCs use `SECURITY DEFINER` to read past RLS for the narrow
  public-safe projection only.
- `event_domains` is untouched — existing tenants continue to resolve via
  `resolve_event_by_host`.
- No grants beyond `GRANT EXECUTE ... TO anon, authenticated` on the new
  RPCs.

## Files

- `01_resolve_agency_by_subdomain.sql`
- `02_get_public_event_by_agency_and_slug.sql`
- `03_agencies_slug_check.sql`
- `04_verify.sql` — sanity SELECTs you can run after apply.
