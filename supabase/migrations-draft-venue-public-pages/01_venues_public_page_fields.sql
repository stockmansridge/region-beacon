-- 01_venues_public_page_fields.sql
-- Draft only. DO NOT EXECUTE.
--
-- Purpose: add additive columns to public.venues so each venue can have a
-- public-facing profile (description, contact details, hero/logo imagery).
--
-- All changes are additive and nullable so existing rows and code remain
-- valid. No RLS, grants, or policies are changed by this file.
--
-- Companion follow-up (NOT included here, drafted separately when approved):
--   - storage RLS extension to allow writes under
--     event-assets/{agency_id}/{event_id}/venues/{venue_id}/{kind}/...
--   - public RPC for /live/$subdomain/venues[/$venueId] that exposes only
--     public-safe columns (no PII, no admin/internal fields).

alter table public.venues
  add column if not exists description    text,
  add column if not exists website_url    text,
  add column if not exists phone          text,
  add column if not exists logo_path      text,
  add column if not exists cover_path     text;

-- Lightweight format guards (optional, mirror visitors.mobile style).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_website_url_format'
  ) then
    alter table public.venues
      add constraint venues_website_url_format
      check (website_url is null or website_url ~* '^https?://');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_phone_format'
  ) then
    alter table public.venues
      add constraint venues_phone_format
      check (phone is null or phone ~ '^\+?[0-9 \-]{6,20}$');
  end if;
end$$;

-- Rollback notes:
--   alter table public.venues
--     drop constraint if exists venues_website_url_format,
--     drop constraint if exists venues_phone_format,
--     drop column if exists cover_path,
--     drop column if exists logo_path,
--     drop column if exists phone,
--     drop column if exists website_url,
--     drop column if exists description;
