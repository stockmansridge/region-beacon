-- 01_event_branding_nav_background_color.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Add a separate column to control the public header / bottom-nav /
--   drawer background colour, decoupled from primary_color. When NULL
--   the frontend continues to fall back to primary_color so existing
--   events render identically.
--
-- Additive only. No grants, RLS, or existing columns are touched.

begin;

alter table public.event_branding
  add column if not exists nav_background_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_nav_background_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_nav_background_color_format
      check (nav_background_color is null or nav_background_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end$$;

comment on column public.event_branding.nav_background_color is
  'Hex (#RRGGBB) background colour for the public mobile header, bottom nav, and drawer. Nullable; falls back to primary_color.';

commit;

-- Rollback:
--   begin;
--   alter table public.event_branding
--     drop constraint if exists event_branding_nav_background_color_format,
--     drop column if exists nav_background_color;
--   commit;
