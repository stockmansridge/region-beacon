-- DRAFT — NOT APPLIED. See README.md.
--
-- Hardens agencies.slug to match what the wildcard router accepts. This is
-- additive: existing slugs already passing the regex remain valid. Before
-- applying, audit `select id, slug from agencies where slug !~ '...';` and
-- decide whether to backfill/rename or skip the constraint until cleaned.
--
-- NOTE: This does NOT add a uniqueness constraint here — the project
-- already enforces uniqueness via the existing agencies_slug_key unique
-- index. If that index does not exist in this environment, add it
-- separately after backfill.

alter table public.agencies
  add constraint agencies_slug_subdomain_shape_chk
  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
  not valid;

-- Run `alter table public.agencies validate constraint agencies_slug_subdomain_shape_chk;`
-- separately once existing rows have been audited / backfilled.
