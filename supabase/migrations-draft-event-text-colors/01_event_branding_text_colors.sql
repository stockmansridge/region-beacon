-- 01_event_branding_text_colors.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Add four explicit semantic text/colour columns to public.event_branding
--   so the Branding editor can drive every public passport page through a
--   small, consistent set of editable colour roles:
--
--     text_color           main body / heading text
--     muted_text_color     helper / metadata / secondary labels
--     border_color         card borders & dividers
--     primary_text_color   text/icons on the primary brand colour button
--
-- All columns are nullable. When NULL, the frontend falls back to the
-- curated palette value (or the legacy primary_color/accent_color pair).
-- Existing events continue to render unchanged until they save once on
-- the simplified editor.
--
-- Additive only. No grants, RLS, or existing columns are touched.

begin;

alter table public.event_branding
  add column if not exists text_color text,
  add column if not exists muted_text_color text,
  add column if not exists border_color text,
  add column if not exists primary_text_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_text_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_text_color_format
      check (text_color is null or text_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_muted_text_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_muted_text_color_format
      check (muted_text_color is null or muted_text_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_border_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_border_color_format
      check (border_color is null or border_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_primary_text_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_primary_text_color_format
      check (primary_text_color is null or primary_text_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end$$;

comment on column public.event_branding.text_color is
  'Hex (#RRGGBB) main text colour: headings, venue names, body copy. Nullable; falls back to palette.';
comment on column public.event_branding.muted_text_color is
  'Hex (#RRGGBB) muted/helper text colour. Nullable; falls back to palette.';
comment on column public.event_branding.border_color is
  'Hex (#RRGGBB) border/divider colour. Nullable; falls back to palette.';
comment on column public.event_branding.primary_text_color is
  'Hex (#RRGGBB) text/icon colour on the primary brand button. Nullable; falls back to palette.';

commit;

-- Rollback:
--   begin;
--   alter table public.event_branding
--     drop constraint if exists event_branding_text_color_format,
--     drop constraint if exists event_branding_muted_text_color_format,
--     drop constraint if exists event_branding_border_color_format,
--     drop constraint if exists event_branding_primary_text_color_format,
--     drop column if exists text_color,
--     drop column if exists muted_text_color,
--     drop column if exists border_color,
--     drop column if exists primary_text_color;
--   commit;
