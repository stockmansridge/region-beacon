-- 03_custom_background_colors.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Allow an event to use a fully custom page background (and optional
--   custom card surface) when `page_background_key = 'custom_color'`.
--   The existing palette/background curated options stay unchanged; this
--   migration only adds two nullable hex columns and exposes them on the
--   public RPC.
--
-- Storage:
--   page_background_color  text  -- '#RRGGBB' (hex, 6-digit)
--   card_background_color  text  -- '#RRGGBB' (hex, 6-digit), optional
--
-- Both are NULL by default. When `page_background_key = 'custom_color'`
-- and `page_background_color` is set, the frontend paints the page with
-- that hex. When `card_background_color` is set, it also overrides the
-- palette card surface; otherwise cards keep the palette default.
--
-- Additive only. No grants, RLS, or existing columns are touched.

begin;

alter table public.event_branding
  add column if not exists page_background_color text,
  add column if not exists card_background_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_page_background_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_page_background_color_format
      check (
        page_background_color is null
        or page_background_color ~ '^#[0-9A-Fa-f]{6}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_card_background_color_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_card_background_color_format
      check (
        card_background_color is null
        or card_background_color ~ '^#[0-9A-Fa-f]{6}$'
      );
  end if;
end$$;

comment on column public.event_branding.page_background_color is
  'Custom hex (#RRGGBB) page background, used when page_background_key = ''custom_color''.';
comment on column public.event_branding.card_background_color is
  'Optional custom hex (#RRGGBB) card surface, used when page_background_key = ''custom_color''.';

commit;

-- Rollback:
--   begin;
--   alter table public.event_branding
--     drop constraint if exists event_branding_page_background_color_format,
--     drop constraint if exists event_branding_card_background_color_format,
--     drop column if exists page_background_color,
--     drop column if exists card_background_color;
--   commit;
