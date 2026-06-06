-- 01_event_branding_event_map.sql
-- DRAFT ONLY. Apply to STAGING after review.
--
-- Adds event-level uploaded site/event map fields onto event_branding.
-- Used by events that take place in a single venue / precinct (markets,
-- expos, halls, showgrounds) where individual venue coordinates aren't
-- relevant and an organiser-supplied site map image or PDF is shown
-- instead of the geolocated venue map.
--
-- Affected tables:
--   public.event_branding (+3 nullable columns)
--
-- Indexes:   none
-- RLS:       no change (table-level RLS unchanged; storage policy extended
--                       in 02_extend_event_assets_storage.sql)
-- Rollback:  alter table public.event_branding
--              drop column if exists event_map_path,
--              drop column if exists event_map_file_type,
--              drop column if exists event_map_file_name;

begin;

alter table public.event_branding
  add column if not exists event_map_path text,
  add column if not exists event_map_file_type text,
  add column if not exists event_map_file_name text;

-- Type validation: must be one of the supported MIME types when set.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_branding_event_map_file_type_chk'
  ) then
    alter table public.event_branding
      add constraint event_branding_event_map_file_type_chk
      check (
        event_map_file_type is null
        or event_map_file_type in (
          'image/png','image/jpeg','image/webp','application/pdf'
        )
      );
  end if;
end$$;

commit;
