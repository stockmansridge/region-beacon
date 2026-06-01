# Extend get_public_event_by_agency_and_slug with palette/background fields

**Status:** DRAFT — apply once to the Supabase project.

Adds 4 columns to the existing public RPC so the `/t/:agency/e/:event` tenant
route can render the saved palette and page background the same way the
subdomain public route already does (the matching extension for
`get_public_event_by_domain` lives in
`supabase/migrations-draft-event-background/04_extend_get_public_event_by_domain_custom_background_colors.sql`).

New columns returned (appended at the end):

- `palette_key text`
- `page_background_key text`
- `page_background_color text`
- `card_background_color text`

The frontend (`src/routes/t.$agencySlug.e.$eventSlug.tsx`) already reads these
optional fields and will silently fall through to defaults until this
migration runs.

## Apply

Run `apply.sql` in the Supabase SQL editor (or via `psql`) against the target
project. It is a drop+create on the existing function — there is no data
change. Existing callers that select by column name continue to work.

## Rollback

Re-apply the original definition from
`supabase/migrations-draft-tenant-routing/02_get_public_event_by_agency_and_slug.sql`
(17-column projection).
