-- 02_extend_public_rpcs_offer_display.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Extends the public list + detail venue RPCs to project the new offer
-- display columns added in 01_venue_offer_display_columns.sql so the
-- public Offers page, Venue cards, and Venue detail page can render
-- each offer with the admin-configured icon/colour.
--
-- Both functions change their return shape, so they are dropped and
-- recreated rather than `create or replace`.
--
-- Assumes the production state already projects `offer_summary` on the
-- list RPC (migrations-draft-public-offers/01_…). Stays SECURITY DEFINER
-- with an explicit search_path; only the projected columns leave the
-- function. No PII, no admin fields.

begin;

-- =============================================================================
-- 1) List RPC
-- =============================================================================
drop function if exists public.get_public_venues_by_domain(text);

create function public.get_public_venues_by_domain(_hostname text)
returns table (
  venue_id                         uuid,
  name                             text,
  description                      text,
  address                          text,
  website_url                      text,
  phone                            text,
  logo_path                        text,
  cover_path                       text,
  offer_summary                    text,
  offer_display_icon               text,
  offer_display_colour             text,
  offer_display_foreground_colour  text,
  lat                              numeric(9,6),
  lng                              numeric(9,6),
  order_index                      int,
  event_found                      boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' or r.event_id is null then
    return query select
      null::uuid, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text,
      null::numeric(9,6), null::numeric(9,6),
      null::int, false;
    return;
  end if;

  return query
    select
      v.id                              as venue_id,
      v.name                            as name,
      v.description                     as description,
      v.address                         as address,
      v.website_url                     as website_url,
      v.phone                           as phone,
      v.logo_path                       as logo_path,
      v.cover_path                      as cover_path,
      v.offer_summary                   as offer_summary,
      v.offer_display_icon              as offer_display_icon,
      v.offer_display_colour            as offer_display_colour,
      v.offer_display_foreground_colour as offer_display_foreground_colour,
      v.lat                             as lat,
      v.lng                             as lng,
      v.order_index                     as order_index,
      true                              as event_found
    from public.venues v
    where v.event_id   = r.event_id
      and v.status     = 'active'
      and v.deleted_at is null
    order by v.order_index nulls last, v.name;
end;
$$;

revoke all on function public.get_public_venues_by_domain(text) from public;
grant execute on function public.get_public_venues_by_domain(text)
  to anon, authenticated;

-- =============================================================================
-- 2) Detail RPC
-- =============================================================================
drop function if exists public.get_public_venue_by_domain(text, uuid);

create function public.get_public_venue_by_domain(
  _hostname text,
  _venue_id uuid
)
returns table (
  venue_id                         uuid,
  name                             text,
  description                      text,
  address                          text,
  website_url                      text,
  phone                            text,
  logo_path                        text,
  cover_path                       text,
  offer_summary                    text,
  offer_display_icon               text,
  offer_display_colour             text,
  offer_display_foreground_colour  text,
  lat                              numeric,
  lng                              numeric,
  order_index                      integer
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved as (
    select *
    from public.resolve_event_by_host(_hostname)
  )
  select
    v.id as venue_id,
    v.name,
    v.description,
    v.address,
    v.website_url,
    v.phone,
    v.logo_path,
    v.cover_path,
    v.offer_summary,
    v.offer_display_icon,
    v.offer_display_colour,
    v.offer_display_foreground_colour,
    v.lat,
    v.lng,
    v.order_index
  from resolved r
  join public.venues v
    on v.event_id = r.event_id
  where r.kind = 'event'
    and v.id = _venue_id
    and v.status = 'active'
    and v.deleted_at is null
  order by v.order_index, v.name
  limit 1;
$$;

revoke all on function public.get_public_venue_by_domain(text, uuid) from public;
grant execute on function public.get_public_venue_by_domain(text, uuid)
  to anon, authenticated;

commit;
