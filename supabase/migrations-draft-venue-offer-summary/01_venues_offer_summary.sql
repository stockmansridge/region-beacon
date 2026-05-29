-- 01_venues_offer_summary.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Adds a simple MVP "About their offer" paragraph to public.venues. This is
-- a deliberate minimal alternative to the full venue_offers table draft
-- (supabase/migrations-draft/14_venue_offers.sql) which is not yet live.
--
-- Field is nullable and additive; existing rows and code remain valid.
-- No RLS, grants, or policies are changed by this file.
--
-- Companion follow-up (drafted in
-- supabase/migrations-draft-public-venue-pages/01_get_public_venues_by_domain.sql):
--   - extend the public venue detail RPC to project offer_summary.

alter table public.venues
  add column if not exists offer_summary text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_offer_summary_len'
  ) then
    alter table public.venues
      add constraint venues_offer_summary_len
      check (offer_summary is null or char_length(offer_summary) <= 800);
  end if;
end$$;

-- Rollback notes:
--   alter table public.venues
--     drop constraint if exists venues_offer_summary_len,
--     drop column if exists offer_summary;
