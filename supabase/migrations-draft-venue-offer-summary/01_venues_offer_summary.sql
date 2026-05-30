-- 01_venues_offer_summary.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Adds a single nullable `offer_summary text` column to public.venues with a
-- CHECK constraint limiting it to 800 characters (trimmed) when not null.
--
-- This is a deliberate minimal MVP alternative to the richer venue_offers
-- table draft in supabase/migrations-draft/14_venue_offers.sql which is
-- not yet live. Additive and nullable; existing rows and code remain valid.
-- No RLS, grants, or policies are changed by this file.

begin;

alter table public.venues
  add column if not exists offer_summary text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_offer_summary_len'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_offer_summary_len
      check (
        offer_summary is null
        or char_length(btrim(offer_summary)) <= 800
      );
  end if;
end $$;

comment on column public.venues.offer_summary is
  'Short public-facing event-specific venue offer summary shown on venue pages. MVP text only; richer offer redemption remains future work.';

commit;

-- Rollback notes:
--   begin;
--   alter table public.venues
--     drop constraint if exists venues_offer_summary_len,
--     drop column if exists offer_summary;
--   commit;
