-- 01_event_branding_page_background_key.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Add a separate, event-level "page background" setting that is
--   independent from the curated colour palette. This drives the
--   background treatment shown behind all public/customer-facing pages
--   (/, /join, /passport/:token, /map, /venues, /venues/:venueId,
--   /offers, /leaderboard, /terms, /privacy, /scan, /checkin/:qrToken).
--
-- Design notes:
--   - Nullable. NULL means "use the default background" (clean_light).
--   - We intentionally do NOT default in the DB; the frontend owns the
--     default so we can iterate on the default without a migration.
--   - Safe identifier shape (lowercase letters / digits / underscore),
--     same convention as palette_key. Length capped to 64 to defend
--     against accidental misuse.
--   - Additive: no existing fields renamed or removed
--     (primary_color, accent_color, palette_key all preserved).
--   - Grants on event_branding are unchanged.

begin;

alter table public.event_branding
  add column if not exists page_background_key text;

-- Safe identifier shape (mirrors the palette_key constraint).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_branding_page_background_key_format'
  ) then
    alter table public.event_branding
      add constraint event_branding_page_background_key_format
      check (
        page_background_key is null
        or (
          length(page_background_key) between 1 and 64
          and page_background_key ~ '^[a-z0-9_]+$'
        )
      );
  end if;
end$$;

commit;

-- Rollback:
--   alter table public.event_branding drop constraint if exists event_branding_page_background_key_format;
--   alter table public.event_branding drop column if exists page_background_key;
