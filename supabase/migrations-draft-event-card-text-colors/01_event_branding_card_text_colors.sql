-- 01_event_branding_card_text_colors.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Split "text colour" into separate page-surface and card-surface
--   variants so events can use a different page background and card
--   background without text becoming unreadable on either surface.
--
--     card_text_color         text/headings inside cards
--     card_muted_text_color   helper/metadata text inside cards
--
--   Existing text_color and muted_text_color continue to control the
--   page-surface text. When the new card-specific columns are NULL the
--   frontend falls back to the page-surface values, so existing events
--   render identically.
--
-- Additive only. No grants, RLS, or existing columns are touched.

begin;

alter table public.event_branding
  add column if not exists card_text_color text,
  add column if not exists card_muted_text_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_card_text_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_card_text_color_format
      check (card_text_color is null or card_text_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_card_muted_text_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_card_muted_text_color_format
      check (card_muted_text_color is null or card_muted_text_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end$$;

comment on column public.event_branding.card_text_color is
  'Hex (#RRGGBB) text colour inside cards (overrides text_color on card surfaces only). Nullable.';
comment on column public.event_branding.card_muted_text_color is
  'Hex (#RRGGBB) muted/helper text colour inside cards. Nullable; falls back to muted_text_color.';

commit;

-- Rollback:
--   begin;
--   alter table public.event_branding
--     drop constraint if exists event_branding_card_text_color_format,
--     drop constraint if exists event_branding_card_muted_text_color_format,
--     drop column if exists card_text_color,
--     drop column if exists card_muted_text_color;
--   commit;
