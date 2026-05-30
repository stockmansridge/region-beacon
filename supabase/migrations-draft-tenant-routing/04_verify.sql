-- DRAFT — read-only verification after applying 01–03 to staging.
-- Run each block in the SQL editor and inspect the output.

-- 1. resolve_agency_by_subdomain signature.
--    Expect 1 row:
--      args   = '_sub text'
--      result = 'TABLE(agency_id uuid, name text, slug text)'
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid)             as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'resolve_agency_by_subdomain';

-- 2. get_public_event_by_agency_and_slug signature.
--    Expect 1 row:
--      args   = '_sub text, _event_slug text'
--      result = 'TABLE(event_id uuid, name text, public_slug citext, description text,
--                      starts_at timestamp with time zone, ends_at timestamp with time zone,
--                      timezone text, logo_path text, cover_path text, primary_color text,
--                      accent_color text, font_family text, welcome_copy text,
--                      terms_url text, current_terms_version_id uuid,
--                      venue_label_singular text, venue_label_plural text)'
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid)             as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_public_event_by_agency_and_slug';

-- 3. agencies_slug_public_subdomain_check constraint exists with the expected
--    predicate. Expect 1 row whose definition contains the regex and the
--    reserved-label list.
select
  c.conname,
  pg_get_constraintdef(c.oid) as definition,
  c.convalidated
from pg_constraint c
join pg_class      t on t.oid = c.conrelid
join pg_namespace  n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'agencies'
  and c.conname = 'agencies_slug_public_subdomain_check';

-- 4. Reserved slugs return 0 rows.
select 'app'   as input, count(*) as rows from public.resolve_agency_by_subdomain('app')
union all
select 'admin'    , count(*) from public.resolve_agency_by_subdomain('admin')
union all
select 'www'      , count(*) from public.resolve_agency_by_subdomain('www')
union all
select 'events'   , count(*) from public.resolve_agency_by_subdomain('events')
union all
select 'api'      , count(*) from public.resolve_agency_by_subdomain('api');
-- All `rows` columns should be 0.

-- 5. A real agency slug resolves. Replace <SLUG> with an actual slug.
--    Expect exactly 1 row with agency_id, name, slug populated.
-- select * from public.resolve_agency_by_subdomain('<SLUG>');

-- 6. A real agency + event public_slug pair resolves. Replace placeholders.
--    Expect exactly 1 row with the 17-column projection (event_id, name,
--    public_slug, description, starts_at, ends_at, timezone, logo_path,
--    cover_path, primary_color, accent_color, font_family, welcome_copy,
--    terms_url, current_terms_version_id, venue_label_singular,
--    venue_label_plural).
-- select * from public.get_public_event_by_agency_and_slug('<SLUG>', '<EVENT_PUBLIC_SLUG>');
