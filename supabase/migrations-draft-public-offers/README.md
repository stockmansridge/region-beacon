# Public Offers page — optional SQL optimisation

Draft only. DO NOT EXECUTE without approval.

## What it does
Extends `public.get_public_venues_by_domain(text)` to project
`offer_summary` alongside the existing public-safe columns. This lets
`/offers` load every venue's offer in a single round-trip instead of
one detail call per venue.

## Why it's optional
The `/offers` page already works without this migration by calling
`get_public_venue_by_domain` once per venue in parallel. The migration
is an N+1 → 1 optimisation, not a correctness fix.

## Rollout
1. Apply `01_extend_get_public_venues_by_domain_offer_summary.sql`.
2. Update `src/routes/live.$subdomain.offers.tsx` to read
   `offer_summary` directly off the list RPC row and drop the per-venue
   detail fetches.

## Safety
- Still scoped to `v.status = 'active' and v.deleted_at is null`.
- No new PII, no admin/internal fields.
- Same `SECURITY DEFINER` + `search_path = public` envelope.
- Grants unchanged (`anon`, `authenticated`).
