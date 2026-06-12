-- Phase D — Brand Kits: additive columns on event_branding.
--
-- All new columns are nullable. No defaults are written to existing
-- rows, so events keep their current rendering until an organiser
-- picks a Brand Kit in the rebuilt admin UI.
--
-- Hex colour columns mirror the existing format constraint used by
-- text_color / card_text_color etc.

alter table public.event_branding
  add column if not exists brand_kit_key       text,
  add column if not exists brand_kit_version   smallint,
  -- Hero band
  add column if not exists hero_bg_color       text,
  add column if not exists hero_fg_color       text,
  add column if not exists hero_accent_color   text,
  -- Buttons
  add column if not exists button_primary_bg   text,
  add column if not exists button_primary_fg   text,
  add column if not exists button_secondary_bg text,
  add column if not exists button_secondary_fg text,
  -- Navigation
  add column if not exists nav_fg_color        text,
  add column if not exists nav_muted_color     text,
  add column if not exists nav_active_fg_color text,
  -- Card border (page border_color already exists)
  add column if not exists card_border_color   text,
  -- Link colour on page/card surfaces
  add column if not exists link_color          text;

-- brand_kit_key: short slug, letters/digits/underscores, or NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_brand_kit_key_format'
      and conrelid = 'public.event_branding'::regclass
  ) then
    alter table public.event_branding
      add constraint event_branding_brand_kit_key_format
      check (brand_kit_key is null or brand_kit_key ~* '^[a-z0-9_]{2,40}$');
  end if;
end$$;

-- Hex format constraints for each new colour column.
do $$
declare
  col text;
  cols text[] := array[
    'hero_bg_color','hero_fg_color','hero_accent_color',
    'button_primary_bg','button_primary_fg',
    'button_secondary_bg','button_secondary_fg',
    'nav_fg_color','nav_muted_color','nav_active_fg_color',
    'card_border_color','link_color'
  ];
  cname text;
begin
  foreach col in array cols loop
    cname := 'event_branding_' || col || '_format';
    if not exists (
      select 1 from pg_constraint
      where conname = cname
        and conrelid = 'public.event_branding'::regclass
    ) then
      execute format(
        'alter table public.event_branding add constraint %I check (%I is null or %I ~* %L)',
        cname, col, col, '^#[0-9a-f]{6}$'
      );
    end if;
  end loop;
end$$;

comment on column public.event_branding.brand_kit_key is
  'Curated Brand Kit slug (Phase D). NULL = legacy palette/background fallback.';
comment on column public.event_branding.brand_kit_version is
  'Version of the kit values written to this row, for future kit revisions.';
