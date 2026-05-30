-- DRAFT — staging only. Apply ONLY after the slug audit returns 0 rows:
--
--   select id, slug from public.agencies
--   where slug::text !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
--      or lower(slug::text) in (
--        'app','admin','api','www','events','support','billing',
--        'login','signup','dashboard','system','assets','static',
--        'cdn','demo','mail'
--      );
--
-- Adds a CHECK constraint that enforces the public-subdomain shape rule for
-- new INSERT / UPDATE traffic only. NOT VALID skips validation of existing
-- rows so the apply cannot fail on legacy data. Run
--
--   alter table public.agencies validate constraint agencies_slug_public_subdomain_check;
--
-- as a separate follow-up once you're confident every existing slug already
-- satisfies the rule (the audit above returning 0 rows is necessary but not
-- sufficient — VALIDATE re-checks every row including ones written after the
-- audit ran).
--
-- Notes on the predicate:
--   - agencies.slug is citext, so we cast to text before regex / lower checks
--     to make the rule explicit and resistant to citext quirks.
--   - The reserved-list mirrors src/lib/reserved-subdomains.ts and the same
--     list embedded in resolve_agency_by_subdomain.
--   - `slug is null` is allowed so the constraint never blocks rows that
--     legitimately have no public subdomain.

alter table public.agencies
  add constraint agencies_slug_public_subdomain_check
  check (
    slug is null
    or (
      slug::text = lower(slug::text)
      and slug::text ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      and lower(slug::text) not in (
        'app','admin','api','www','events','support','billing',
        'login','signup','dashboard','system','assets','static',
        'cdn','demo','mail'
      )
    )
  ) not valid;
