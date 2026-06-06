-- 02_extend_event_assets_storage.sql
-- DRAFT ONLY. Apply to STAGING after review.
--
-- Extends the existing `event-assets` Storage bucket + path helper to
-- support a third kind, 'map', used for event-level site maps. Adds
-- application/pdf to the allowed MIME list and lifts the size cap to
-- 10 MB to accommodate PDF site plans.
--
-- Affected:
--   storage.buckets row 'event-assets'  (allowed_mime_types, file_size_limit)
--   public.event_assets_path_parts(text)  (accepts kind 'map')
--
-- Writer gate (public.can_write_event_asset) is unchanged and continues
-- to allow only platform_admin OR agency_owner/agency_admin of the
-- owning agency. Existing 'logo'/'cover' paths are unaffected.
--
-- Rollback:
--   Re-run migrations-draft-event-assets-storage/01_event_assets_bucket.sql

begin;

-- 1. Widen bucket: allow PDF + raise size cap to 10 MB.
update storage.buckets
   set file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = array[
         'image/png',
         'image/jpeg',
         'image/webp',
         'application/pdf'
       ]
 where id = 'event-assets';

-- 2. Replace the path-parts helper to also recognise kind 'map'.
--    Shape and grants preserved from migrations-draft-event-assets-storage.
create or replace function public.event_assets_path_parts(_name text)
returns table (agency_id uuid, event_id uuid, kind text)
language sql
immutable
as $$
  with parts as (
    select string_to_array(coalesce(_name, ''), '/') as p
  ),
  shaped as (
    select
      p,
      array_length(p, 1)               as n,
      case when array_length(p, 1) >= 4 then (p)[1] else null end as s1,
      case when array_length(p, 1) >= 4 then (p)[2] else null end as s2,
      case when array_length(p, 1) >= 4 then (p)[3] else null end as s3,
      case when array_length(p, 1) >= 4 then (p)[4] else null end as s4
    from parts
  )
  select
    (s1)::uuid as agency_id,
    (s2)::uuid as event_id,
    s3         as kind
  from shaped
  where n >= 4
    and s3 in ('logo', 'cover', 'map')
    and s4 is not null
    and length(s4) > 0
    and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

grant execute on function public.event_assets_path_parts(text) to authenticated, anon;

commit;
