-- 01_venue_offer_display_columns.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Adds three additive, nullable display-configuration columns to
-- public.venues so admins can customise how a venue's offer is shown on
-- public pages (Offers list, Venue cards, Venue detail).
--
-- All columns are nullable; existing offers continue to render with the
-- event theme defaults. No data migration is required. No RLS/grant
-- changes are made by this file.

begin;

alter table public.venues
  add column if not exists offer_display_icon text,
  add column if not exists offer_display_colour text,
  add column if not exists offer_display_foreground_colour text;

-- Constrain icon to a controlled vocabulary so the admin UI and the
-- public renderer can rely on a finite icon map. NULL means "default".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_offer_display_icon_chk'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_offer_display_icon_chk
      check (
        offer_display_icon is null
        or offer_display_icon in (
          'gift','wine','ticket','tag','food','coffee','trophy',
          'star','map_pin','percent','shopping_bag','music','generic_offer'
        )
      );
  end if;
end $$;

-- Lightweight format checks for colour fields (#RGB or #RRGGBB).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_offer_display_colour_fmt'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_offer_display_colour_fmt
      check (
        offer_display_colour is null
        or offer_display_colour ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_offer_display_fg_fmt'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_offer_display_fg_fmt
      check (
        offer_display_foreground_colour is null
        or offer_display_foreground_colour ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
      );
  end if;
end $$;

comment on column public.venues.offer_display_icon is
  'Optional controlled-vocabulary icon key for the public offer badge.';
comment on column public.venues.offer_display_colour is
  'Optional background/accent colour for the public offer badge (#hex).';
comment on column public.venues.offer_display_foreground_colour is
  'Optional foreground/icon colour for the public offer badge (#hex).';

commit;

-- Rollback:
--   begin;
--   alter table public.venues
--     drop constraint if exists venues_offer_display_icon_chk,
--     drop constraint if exists venues_offer_display_colour_fmt,
--     drop constraint if exists venues_offer_display_fg_fmt,
--     drop column if exists offer_display_icon,
--     drop column if exists offer_display_colour,
--     drop column if exists offer_display_foreground_colour;
--   commit;
