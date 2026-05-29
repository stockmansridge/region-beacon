-- 01_extend_get_public_event_by_domain.sql
--
-- DRAFT — do not execute automatically. Apply manually on staging once reviewed.
--
-- Purpose:
--   Extend public.get_public_event_by_domain(_hostname text) so the customer
--   passport (and admin live preview) can render the configurable venue
--   terminology stored on event_branding.
--
-- Adds to the existing return shape:
--   - venue_label_singular text  (fallback 'Venue')
--   - venue_label_plural   text  (fallback 'Venues')
--
-- Notes:
--   - Keeps SECURITY DEFINER and search_path = public (as the existing fn).
--   - Keeps existing anon/authenticated EXECUTE grants intact (they apply to
--     the function name; CREATE OR REPLACE preserves grants).
--   - Only returns safe public fields: event identity, dates/timezone,
--     branding, terms metadata. NO billing, NO visitor data, NO QR tokens,
--     NO emails/phones, NO admin-only fields.
--   - DOES NOT modify resolve_event_by_host.
--   - Re-create requires DROP because the OUT signature changes; we keep the
--     argument list identical so call sites stay compatible.
--
-- Rollback:
--   Re-apply the previous definition (snapshot the prior body before running
--   this migration so you can restore it verbatim if needed).

begin;

drop function if exists public.get_public_event_by_domain(text);

create or replace function public.get_public_event_by_domain(_hostname text)
returns table (
  event_id                  uuid,
  name                      text,
  public_slug               text,
  description               text,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  timezone                  text,
  logo_path                 text,
  cover_path                text,
  primary_color             text,
  accent_color              text,
  font_family               text,
  welcome_copy              text,
  terms_url                 text,
  current_terms_version_id  uuid,
  venue_label_singular      text,
  venue_label_plural        text
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved as (
    select r.event_id
    from public.resolve_event_by_host(_hostname) r
    where r.kind = 'event' and r.event_id is not null
    limit 1
  )
  select
    e.id                              as event_id,
    e.name,
    e.public_slug,
    e.description,
    e.starts_at,
    e.ends_at,
    e.timezone,
    b.logo_path,
    b.cover_path,
    b.primary_color,
    b.accent_color,
    b.font_family,
    b.welcome_copy,
    b.terms_url,
    e.current_terms_version_id,
    coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue')  as venue_label_singular,
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues') as venue_label_plural
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where e.deleted_at is null;
$$;

-- Preserve grants explicitly (no-op if already granted).
grant execute on function public.get_public_event_by_domain(text) to anon, authenticated;

commit;
