# Draft: venues.offer_summary

Status: **DRAFT — NOT EXECUTED**

Adds a single nullable `offer_summary text` column (≤ 800 chars) to
`public.venues` so each venue can display a short "About their offer"
paragraph on its public profile.

## Why not `venue_offers`?

`supabase/migrations-draft/14_venue_offers.sql` already defines a richer
`venue_offers` table (title, description, redemption_instructions, type,
date windows). That table is **not** live and depends on policies/RPCs
that have not been drafted. For the MVP we only need a single paragraph
of free-text copy, so an additive column on `venues` is significantly
smaller surface area and unblocks the admin editor and public profile
page today. The richer `venue_offers` table remains the future home for
real offer redemption and date-windowed offers.

## Apply order

1. `01_venues_offer_summary.sql` — additive column + length check.
2. Update the public RPCs in
   `supabase/migrations-draft-public-venue-pages/` so `offer_summary` is
   projected on the venue detail response.

## Rollback

See trailing comment block in `01_venues_offer_summary.sql`.
