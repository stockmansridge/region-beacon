-- 01_event_branding_hero_overlay.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Add two nullable columns to public.event_branding so admins can
--   customise the public hero image overlay/fade:
--     - hero_overlay_color    text   nullable, 6-digit hex (#RRGGBB)
--     - hero_overlay_opacity  int    nullable, 0..100 (percent)
--
-- Safety:
--   * Both columns are nullable with no default — every existing row is
--     untouched and continues to render the legacy 3-stop gradient
--     overlay when both fields are NULL.
--   * A check constraint validates the hex format (when present).
--   * A check constraint validates opacity range 0..100 (when present).
--
-- Rollback:
--   alter table public.event_branding drop column hero_overlay_opacity;
--   alter table public.event_branding drop column hero_overlay_color;

begin;

alter table public.event_branding
  add column if not exists hero_overlay_color   text,
  add column if not exists hero_overlay_opacity smallint;

alter table public.event_branding
  drop constraint if exists event_branding_hero_overlay_color_hex;
alter table public.event_branding
  add constraint event_branding_hero_overlay_color_hex
  check (hero_overlay_color is null
         or hero_overlay_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.event_branding
  drop constraint if exists event_branding_hero_overlay_opacity_range;
alter table public.event_branding
  add constraint event_branding_hero_overlay_opacity_range
  check (hero_overlay_opacity is null
         or (hero_overlay_opacity between 0 and 100));

commit;
