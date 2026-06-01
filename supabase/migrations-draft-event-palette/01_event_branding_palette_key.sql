-- 01_event_branding_palette_key.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Adds a single nullable `palette_key text` column to public.event_branding
-- so each event can opt into one of the curated public palettes defined in
-- src/lib/event-palettes.ts (TBD — to be added when this migration is
-- approved). When NULL, the public pages keep using existing
-- primary_color/accent_color (and the GetStampd default fallback).
--
-- Additive and nullable; existing rows and existing branding-editor code
-- paths remain valid. No RLS, grants, or policies are changed by this file.

begin;

alter table public.event_branding
  add column if not exists palette_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_branding_palette_key_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_palette_key_format
      check (
        palette_key is null
        or palette_key ~ '^[a-z][a-z0-9_]{2,40}$'
      );
  end if;
end $$;

comment on column public.event_branding.palette_key is
  'Optional curated palette key (see src/lib/event-palettes.ts). When NULL, public pages fall back to primary_color/accent_color and the default theme.';

commit;

-- Rollback:
--   begin;
--   alter table public.event_branding
--     drop constraint if exists event_branding_palette_key_format,
--     drop column if exists palette_key;
--   commit;
