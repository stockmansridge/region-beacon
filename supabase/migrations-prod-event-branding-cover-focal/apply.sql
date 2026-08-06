-- apply.sql — PRODUCTION FIX
-- Project: kyjwifumacnrpgyextzz
--
-- Root cause: the branding editor reads/writes event_branding.cover_focal_x /
-- cover_focal_y (cover-image focal point, stored as 0–100 percentages and
-- applied as CSS object-position). Those columns were only ever drafted
-- (supabase/migrations-draft-cover-focal), never applied, so PostgREST rejects
-- both the SELECT and the PATCH with:
--   PGRST204 — Could not find the 'cover_focal_x' column of 'event_branding'
--
-- Safe to run repeatedly. Adds columns only when absent; no duplicates if the
-- draft was partially applied.

begin;

alter table public.event_branding
  add column if not exists cover_focal_x numeric,
  add column if not exists cover_focal_y numeric;

-- Existing rows (and rows created by the draft as nullable) default to centre.
update public.event_branding set cover_focal_x = 50 where cover_focal_x is null;
update public.event_branding set cover_focal_y = 50 where cover_focal_y is null;

alter table public.event_branding
  alter column cover_focal_x set default 50,
  alter column cover_focal_y set default 50,
  alter column cover_focal_x set not null,
  alter column cover_focal_y set not null;

-- Range checks: 0–100 percentages (matches src/lib/cover-focal.ts).
alter table public.event_branding
  drop constraint if exists event_branding_cover_focal_x_range,
  drop constraint if exists event_branding_cover_focal_y_range,
  drop constraint if exists event_branding_cover_focal_x_check,
  drop constraint if exists event_branding_cover_focal_y_check;

alter table public.event_branding
  add constraint event_branding_cover_focal_x_check
  check (cover_focal_x >= 0 and cover_focal_x <= 100);

alter table public.event_branding
  add constraint event_branding_cover_focal_y_check
  check (cover_focal_y >= 0 and cover_focal_y <= 100);

comment on column public.event_branding.cover_focal_x is
  'Cover image focal point X, 0–100 percent, applied as CSS object-position. Default 50 (centre).';
comment on column public.event_branding.cover_focal_y is
  'Cover image focal point Y, 0–100 percent, applied as CSS object-position. Default 50 (centre).';

commit;

notify pgrst, 'reload schema';

-- Verify:
--   select cover_focal_x, cover_focal_y from public.event_branding limit 5;
