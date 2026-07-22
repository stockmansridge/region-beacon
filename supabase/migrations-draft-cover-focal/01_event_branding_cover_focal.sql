-- 01_event_branding_cover_focal.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Add cover_focal_x / cover_focal_y (0-100 integer, default 50) to
--   public.event_branding so organisers can position the visible crop
--   window of a cover image that's larger than the hero frame.
--
-- The public passport pages apply these as CSS `object-position`
-- percentages on the hero <img>. A NULL / missing value falls back to
-- 50/50 (centred), preserving existing behaviour.

begin;

alter table public.event_branding
  add column if not exists cover_focal_x smallint,
  add column if not exists cover_focal_y smallint;

alter table public.event_branding
  add constraint event_branding_cover_focal_x_range
    check (cover_focal_x is null or (cover_focal_x between 0 and 100)) not valid,
  add constraint event_branding_cover_focal_y_range
    check (cover_focal_y is null or (cover_focal_y between 0 and 100)) not valid;

alter table public.event_branding validate constraint event_branding_cover_focal_x_range;
alter table public.event_branding validate constraint event_branding_cover_focal_y_range;

commit;
