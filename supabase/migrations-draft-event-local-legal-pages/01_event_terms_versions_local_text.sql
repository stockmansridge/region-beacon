-- 01_event_terms_versions_local_text.sql
-- DRAFT — do not execute automatically. Apply manually on staging once
-- reviewed.
--
-- Purpose:
--   Allow each event to publish GetStampd-hosted Terms and Privacy pages,
--   alongside (or instead of) the existing external terms_url/privacy_url.
--
-- Design constraints honoured by this migration:
--   * Additive only. event_terms_versions stays immutable (deny_all RLS in
--     migrations-draft/26 still applies; visitor_consents.terms_version_id
--     FK is unchanged).
--   * Existing rows pre-date local text and have terms_url/privacy_url NOT
--     NULL. The two URL columns stay NOT NULL on legacy rows.
--   * For new rows the caller chooses the "source" (external_url vs
--     local_text) and a check constraint enforces it for that row only.
--   * Adds an event-level switch (events.legal_source) so the public
--     resolver can prefer local text without inferring intent from data
--     shape.
--
-- Rollback:
--   begin;
--   alter table public.event_terms_versions drop constraint if exists
--     event_terms_versions_legal_source_shape;
--   alter table public.event_terms_versions drop column if exists
--     terms_title, drop column if exists terms_body,
--     drop column if exists privacy_title, drop column if exists privacy_body,
--     drop column if exists legal_source;
--   alter table public.events drop column if exists legal_source;
--   commit;

begin;

------------------------------------------------------------------------------
-- 1. Per-version legal source + local text fields (all NULLable, additive).
------------------------------------------------------------------------------

alter table public.event_terms_versions
  add column if not exists legal_source text
    not null default 'external_url'
    check (legal_source in ('external_url', 'local_text')),
  add column if not exists terms_title text,
  add column if not exists terms_body text,
  add column if not exists privacy_title text,
  add column if not exists privacy_body text;

-- Make URL columns optional for future local_text rows. Existing rows still
-- have NOT NULL values; this only relaxes the column for new inserts and
-- is gated by the shape check below.
alter table public.event_terms_versions
  alter column terms_url drop not null,
  alter column privacy_url drop not null;

-- Shape constraint per row:
--   external_url  -> terms_url + privacy_url required
--   local_text    -> terms_body + privacy_body required (titles optional)
alter table public.event_terms_versions
  drop constraint if exists event_terms_versions_legal_source_shape;
alter table public.event_terms_versions
  add constraint event_terms_versions_legal_source_shape check (
    case legal_source
      when 'external_url' then
        terms_url is not null
        and privacy_url is not null
      when 'local_text' then
        terms_body is not null and btrim(terms_body) <> ''
        and privacy_body is not null and btrim(privacy_body) <> ''
      else false
    end
  );

-- Soft length caps. Plenty of headroom for realistic legal copy without
-- inviting abuse.
alter table public.event_terms_versions
  drop constraint if exists event_terms_versions_text_length;
alter table public.event_terms_versions
  add constraint event_terms_versions_text_length check (
    (terms_title    is null or char_length(terms_title)    <= 120)
    and (privacy_title is null or char_length(privacy_title) <= 120)
    and (terms_body    is null or char_length(terms_body)    <= 20000)
    and (privacy_body  is null or char_length(privacy_body)  <= 20000)
  );

------------------------------------------------------------------------------
-- 2. Event-level switch so resolvers/public RPCs know which to prefer.
--    Default keeps the current behaviour (external URLs).
------------------------------------------------------------------------------

alter table public.events
  add column if not exists legal_source text
    not null default 'external_url'
    check (legal_source in ('external_url', 'local_text'));

commit;

-- Notes:
--   * RLS on event_terms_versions is unchanged (deny_all). All writes still
--     go through SECURITY DEFINER admin code paths or through the existing
--     "insert as authenticated" grant gated by the policies in
--     migrations-draft/26 (admin/owner only).
--   * No GRANT changes — column additions inherit the existing table grants.
--   * No changes to visitor_consents or register_visitor.
