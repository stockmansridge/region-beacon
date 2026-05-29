# Draft migration — extend `get_public_event_by_domain` with venue labels

**Status:** draft only. Not executed. Apply manually on staging.

## What it does

Adds two columns to the return shape of
`public.get_public_event_by_domain(_hostname text)`:

- `venue_label_singular text` (fallback `'Venue'`)
- `venue_label_plural   text` (fallback `'Venues'`)

Sourced from `public.event_branding`. Coalesces null/blank to the defaults.

## What it does NOT change

- `resolve_event_by_host` — untouched.
- `event_branding` schema — untouched (already migrated separately).
- Grants — preserved (anon, authenticated EXECUTE).
- Security model — keeps `SECURITY DEFINER` and `set search_path = public`.

## Public-surface review

The function only returns safe public fields used by the published passport
landing page:

- event identity: `event_id`, `name`, `public_slug`
- presentation: `description`, `starts_at`, `ends_at`, `timezone`
- branding: `logo_path`, `cover_path`, `primary_color`, `accent_color`,
  `font_family`, `welcome_copy`, `terms_url`, `current_terms_version_id`
- labels (new): `venue_label_singular`, `venue_label_plural`

No billing, visitor, passport, check-in, QR, email, phone, or admin fields
are returned.

## Files

- `01_extend_get_public_event_by_domain.sql` — drop + recreate.
- `02_verify.sql` — manual verification queries.

## Apply

Run `01_extend_get_public_event_by_domain.sql` in the Supabase SQL editor on
staging, then run the queries in `02_verify.sql` to confirm.

## Frontend follow-up

`src/routes/live.$subdomain.tsx` already reads `venue_label_singular` /
`venue_label_plural` defensively via `resolveVenueLabels()` and falls back to
`Venue` / `Venues` when the fields are absent, so it is safe to deploy the
frontend before the RPC is applied.
