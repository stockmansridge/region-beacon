-- 02_extend_get_public_event_by_domain_cover_focal.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Run AFTER 01_event_branding_cover_focal.sql.
--
-- Extend public.get_public_event_by_domain to surface cover_focal_x
-- and cover_focal_y so public passport pages can apply the crop
-- window chosen in the branding editor.
--
-- NOTE: apply this on top of the CURRENT deployed version of
-- get_public_event_by_domain in your environment (columns will vary).
-- Below is the merged shape as of the latest draft chain — copy any
-- additional columns your production version already returns into
-- the RETURNS TABLE list and the SELECT below before running.

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
  cover_focal_x             smallint,
  cover_focal_y             smallint,
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
  text_color                text,
  muted_text_color          text,
  border_color              text,
  primary_text_color        text,
  hero_overlay_color        text,
  hero_overlay_opacity      smallint
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
    e.id, e.name, e.public_slug, e.description,
    e.starts_at, e.ends_at, e.timezone,
    b.logo_path, b.cover_path,
    b.cover_focal_x, b.cover_focal_y,
    b.primary_color, b.accent_color, b.font_family,
    b.welcome_copy, b.terms_url,
    e.current_terms_version_id,
    coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue'),
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues'),
    b.palette_key, b.page_background_key,
    b.page_background_color, b.card_background_color,
    b.text_color, b.muted_text_color, b.border_color,
    b.primary_text_color,
    b.hero_overlay_color, b.hero_overlay_opacity
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where e.deleted_at is null;
$$;

grant execute on function public.get_public_event_by_domain(text) to anon, authenticated;

commit;
