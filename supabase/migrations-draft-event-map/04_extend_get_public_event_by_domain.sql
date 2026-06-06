-- 04_extend_get_public_event_by_domain.sql
-- DRAFT ONLY. Apply AFTER 01 and 03.
--
-- Extends public.get_public_event_by_domain(_hostname) to also surface
-- event_map_path, event_map_file_type, event_map_file_name so the public
-- map route can render an uploaded site map for events without geocoded
-- venues — with no extra round-trip.
--
-- Preserved verbatim:
--   - SECURITY DEFINER, set search_path = public
--   - publish-gate (resolve_event_by_host kind='event'), deleted_at filter
--   - grants to anon, authenticated
--   - column order/types of all previously returned fields
--
-- Drop+create required because the RETURNS TABLE signature changes.

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
  venue_label_plural        text,
  palette_key               text,
  page_background_key       text,
  page_background_color     text,
  card_background_color     text,
  event_map_path            text,
  event_map_file_type       text,
  event_map_file_name       text
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
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues') as venue_label_plural,
    b.palette_key                     as palette_key,
    b.page_background_key             as page_background_key,
    b.page_background_color           as page_background_color,
    b.card_background_color           as card_background_color,
    b.event_map_path                  as event_map_path,
    b.event_map_file_type             as event_map_file_type,
    b.event_map_file_name             as event_map_file_name
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where e.deleted_at is null;
$$;

grant execute on function public.get_public_event_by_domain(text) to anon, authenticated;

commit;
