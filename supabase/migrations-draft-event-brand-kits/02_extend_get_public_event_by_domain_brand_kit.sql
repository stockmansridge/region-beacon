-- 02_extend_get_public_event_by_domain_brand_kit.sql
-- DRAFT ONLY. Run AFTER 01 and 03 (heading/body columns).
--
-- Extends public.get_public_event_by_domain(_hostname) to surface all
-- Phase D Brand Kit branding fields plus the new heading/body/muted
-- split columns. All previously returned fields are preserved verbatim
-- and kept in the same position to remain backward compatible with
-- existing callers; new columns are appended.
--
-- SECURITY DEFINER + search_path = public + anon/authenticated grants
-- preserved per existing pattern.

begin;

drop function if exists public.get_public_event_by_domain(text);

create or replace function public.get_public_event_by_domain(_hostname text)
returns table (
  -- ===== Existing columns (unchanged order/types) =====
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
  text_color                text,
  muted_text_color          text,
  card_text_color           text,
  card_muted_text_color     text,
  border_color              text,
  primary_text_color        text,
  nav_background_color      text,
  -- ===== Phase D — Brand Kit selection =====
  brand_kit_key             text,
  brand_kit_version         smallint,
  -- ===== Phase D — Heading / body / muted split =====
  page_heading_color        text,
  page_body_color           text,
  page_muted_color          text,
  card_heading_color        text,
  card_body_color           text,
  card_muted_color          text,
  -- ===== Phase D — Card border + link =====
  card_border_color         text,
  link_color                text,
  -- ===== Phase D — Buttons =====
  button_primary_bg         text,
  button_primary_fg         text,
  button_secondary_bg       text,
  button_secondary_fg       text,
  -- ===== Phase D — Navigation =====
  nav_fg_color              text,
  nav_muted_color           text,
  nav_active_fg_color       text,
  -- ===== Phase D — Hero band =====
  hero_bg_color             text,
  hero_fg_color             text,
  hero_accent_color         text
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
    b.palette_key,
    b.page_background_key,
    b.page_background_color,
    b.card_background_color,
    b.text_color,
    b.muted_text_color,
    b.card_text_color,
    b.card_muted_text_color,
    b.border_color,
    b.primary_text_color,
    b.nav_background_color,
    b.brand_kit_key,
    b.brand_kit_version,
    b.page_heading_color,
    b.page_body_color,
    b.page_muted_color,
    b.card_heading_color,
    b.card_body_color,
    b.card_muted_color,
    b.card_border_color,
    b.link_color,
    b.button_primary_bg,
    b.button_primary_fg,
    b.button_secondary_bg,
    b.button_secondary_fg,
    b.nav_fg_color,
    b.nav_muted_color,
    b.nav_active_fg_color,
    b.hero_bg_color,
    b.hero_fg_color,
    b.hero_accent_color
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where e.deleted_at is null;
$$;

revoke all on function public.get_public_event_by_domain(text) from public;
grant execute on function public.get_public_event_by_domain(text) to anon, authenticated;

commit;

-- Rollback: re-apply
--   supabase/migrations-draft-event-nav-background/02_extend_get_public_event_by_domain_nav_background_color.sql
