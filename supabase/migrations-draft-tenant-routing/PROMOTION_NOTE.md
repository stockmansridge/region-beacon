# Tenant Routing — Promotion Note (current project = production)

**Decision (recorded):** the Supabase project this repo is connected to has
been promoted to production / live. It contains 1 agency and 4 events and is
clean enough to serve as the live database.

## What this means for the tenant-routing migrations

- The tenant-routing SQL (`01_resolve_agency_by_subdomain.sql`,
  `02_get_public_event_by_agency_and_slug.sql` — patched `evt_slug` variant,
  `03_agencies_slug_check.sql` — `NOT VALID`) is **already applied to the
  live database** and is considered production-ready.
- `PRODUCTION_BUNDLE.sql` and `PRODUCTION_READINESS.md` are kept for
  historical reference / future re-use against a *different* database
  (e.g. a future staging/dev project). **Do NOT re-apply
  `PRODUCTION_BUNDLE.sql` to the current live database** — it is not
  guaranteed idempotent.
- The `agencies_slug_public_subdomain_check` constraint is still `NOT VALID`.
  That is intentional. Do not run `VALIDATE CONSTRAINT` as part of the
  Cloudflare cutover.

## Terminology

Earlier docs refer to this database as "staging". Treat every such reference
as meaning the **current / live** database. A separate staging/dev Supabase
project will be created **after** Cloudflare production is stable; until
then, Lovable preview/dev and Cloudflare production both point at this
same live project.

## Do / Don't

- ✅ Use this project's URL + anon key as the Cloudflare build env values.
- ✅ Keep `NOT VALID` on the agencies slug constraint.
- ✅ Leave `event_domains` and `/live/*` untouched.
- ❌ Do not migrate data into another project.
- ❌ Do not re-run `PRODUCTION_BUNDLE.sql` against this project.
- ❌ Do not validate the `NOT VALID` constraint as part of this cutover.
