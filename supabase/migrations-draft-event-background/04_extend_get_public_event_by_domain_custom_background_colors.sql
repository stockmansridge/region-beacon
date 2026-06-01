-- 04_extend_get_public_event_by_domain_custom_background_colors.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Run AFTER 03_custom_background_colors.sql.
--
-- Purpose:
--   Extend public.get_public_event_by_domain(_hostname) to also surface
--   page_background_color and card_background_color so public pages can
--   paint a fully custom hex page background when an event picks the
--   "Custom colour" background option.
--
-- Preserved verbatim from the previous version:
--   - SECURITY DEFINER
--   - set search_path = public
--   - publish-gate (resolve_event_by_host kind='event'), deleted_at filter
--   - grants to anon, authenticated
--   - column order/types of all previously returned fields
--
-- Drop+create required because RETURNS TABLE signature changes.

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
  card_background_color     text
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
    b.card_background_color           as card_background_color
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where e.deleted_at is null;
$$;

grant execute on function public.get_public_event_by_domain(text) to anon, authenticated;

commit;

-- Rollback: re-apply 02_extend_get_public_event_by_domain_page_background_key.sql
