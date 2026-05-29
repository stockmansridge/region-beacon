# Venue public pages — draft migration

Draft only. DO NOT EXECUTE without explicit approval.

## Why
Each venue needs a public-facing profile page (e.g.
`/live/$subdomain/venues/$venueId`) so visitors can see what a stop is
about before scanning the QR. Today `public.venues` only has operational
fields (name, address, lat/lng, order, status).

## What this draft adds
Additive nullable columns on `public.venues`:

| Column | Type | Purpose |
| --- | --- | --- |
| `description` | text | Public blurb shown on the venue page |
| `website_url` | text | Public website link (must be http/https) |
| `phone` | text | Public contact phone (loose format guard) |
| `logo_path` | text | Storage path to venue logo |
| `cover_path` | text | Storage path to venue hero/cover image |

No RLS, grants, indexes, triggers, or policies are touched. No production
data is modified. Existing inserts/updates remain valid because every new
column is nullable.

## Not in this draft
1. Storage RLS extension. Today
   `event-assets/{agency_id}/{event_id}/{logo|cover}/...` is the only
   writable shape. Venue images would need
   `event-assets/{agency_id}/{event_id}/venues/{venue_id}/{logo|cover}/...`
   added to the storage policy. A second draft will be created once the
   schema change above is approved.
2. Public RPC. A read-only `get_public_venue_page` (or extension of
   `get_public_event_by_domain`) returning ONLY public-safe columns is
   required before any `/live/...` venue route ships.
3. Frontend editor in `/admin/events/$eventId`. Will be wired only after
   both the schema and storage policy drafts are approved.

## Rollback
See the trailing block in `01_venues_public_page_fields.sql`.
