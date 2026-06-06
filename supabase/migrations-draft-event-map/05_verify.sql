-- 05_verify.sql — sanity checks after applying 01–04.

-- Columns exist
select column_name, data_type
  from information_schema.columns
 where table_schema='public' and table_name='event_branding'
   and column_name in ('event_map_path','event_map_file_type','event_map_file_name')
 order by column_name;

-- Bucket accepts PDF + 10MB cap
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id='event-assets';

-- Path helper accepts 'map'
select * from public.event_assets_path_parts(
  '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/map/x.pdf'
);

-- RPCs exist
select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public'
   and p.proname in ('save_event_map','clear_event_map','get_public_event_by_domain');
