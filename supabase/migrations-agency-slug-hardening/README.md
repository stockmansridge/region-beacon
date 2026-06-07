# Agency slug hardening (defence-in-depth)

Adds server-side slug validation to `public.create_customer_agency` so an
invalid slug raises `agency_slug_invalid` cleanly **before** PostgreSQL
ever evaluates the `agencies_slug_public_subdomain_check` constraint.

## What this migration changes

- Replaces the function body of `public.create_customer_agency(text, text, text)`.
- Keeps the exact same 3-arg signature (`_agency_name`, `_agency_slug`,
  `_signup_intention text default null`) and return type (`uuid`).
- Slug rule is now byte-for-byte aligned with the DB CHECK constraint:
  - lowercase
  - regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
  - length 1..63 (DNS-label limit)
  - rejects the reserved-label list used by routing + the CHECK constraint
- Drops both prior 2-arg and 3-arg overloads first to guarantee PostgREST
  sees exactly one resolution (no ambiguity).
- Preserves all existing behaviour: auth check, name check,
  `agency_slug_taken` for duplicates, agency insert, agency_owner
  membership, `signup_intention` persistence.

## How to apply

Run `apply.sql` against the Supabase project as a privileged user. It is
idempotent and safe to re-run.

## Three places to keep in sync

If you ever change the slug rule, update all three together:

1. CHECK constraint `agencies_slug_public_subdomain_check`
2. Frontend `src/lib/pending-organisation-signup.ts` (`sanitiseAgencySlug` /
   `isValidAgencySlug`) plus `src/lib/reserved-subdomains.ts`
3. This RPC body

## Post-apply verification

See the SQL comments at the bottom of `apply.sql` for the three verification
queries: overload count, invalid-slug rejection, and a happy-path signup.
