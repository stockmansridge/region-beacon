-- 03_verify.sql — manual sanity checks. Run on staging after applying
-- 01 and 02. Read-only; safe to re-run.

-- A. Column additions present and correctly typed.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'event_terms_versions'
  and column_name in (
    'legal_source','terms_title','terms_body','privacy_title','privacy_body',
    'terms_url','privacy_url'
  )
order by column_name;

-- B. events.legal_source switch exists.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'events'
  and column_name = 'legal_source';

-- C. Check constraints exist.
select conname
from pg_constraint
where conrelid = 'public.event_terms_versions'::regclass
  and conname in (
    'event_terms_versions_legal_source_shape',
    'event_terms_versions_text_length'
  );

-- D. Inserting a local_text row WITHOUT body must fail (P0001 / check).
-- Uncomment in a transaction you intend to roll back:
-- begin;
-- insert into public.event_terms_versions (
--   agency_id, event_id, terms_version, privacy_version,
--   legal_source, terms_url, privacy_url
-- ) values (
--   '00000000-0000-0000-0000-000000000000',
--   '00000000-0000-0000-0000-000000000000',
--   '1.0', '1.0', 'local_text', null, null
-- );
-- rollback;

-- E. Public RPC returns one row for a known live subdomain and zero for garbage.
select * from public.get_public_event_legal_by_domain('garbage-host.invalid');
-- select * from public.get_public_event_legal_by_domain('demo.getstamped.com.au');
