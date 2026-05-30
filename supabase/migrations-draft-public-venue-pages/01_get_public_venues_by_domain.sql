-- 01_get_public_venues_by_domain.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Public, privacy-safe venue lookups keyed by hostname. Powers the
-- /live/$subdomain/venues and /live/$subdomain/venues/$venueId routes.
--
-- Depends on (already on staging unless noted):
--   * public.resolve_event_by_host(text)
--   * public.venues (with description/website_url/phone/logo_path/cover_path
--     columns from migrations-draft-venue-public-pages/01)
--   * public.venues.offer_summary
--     (from migrations-draft-venue-offer-summary/01_venues_offer_summary.sql)
--
-- SECURITY: SECURITY DEFINER with explicit search_path. No SELECT *.
-- Only the projected columns below leave each function. No QR tokens,
-- visitor data, passport data, checkin data, admin fields, or billing
-- data are ever returned.

begin;

-- =============================================================================
-- 1) List RPC: get_public_venues_by_domain
-- =============================================================================
create or replace function public.get_public_venues_by_domain(_hostname text)
returns table (
  venue_id      uuid,
  name          text,
  description   text,
  address       text,
  website_url   text,
  phone         text,
  logo_path     text,
  cover_path    text,
  lat           numeric(9,6),
  lng           numeric(9,6),
  order_index   int,
  event_found   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Host resolution; publishing gate is enforced inside resolve_event_by_host.
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' or r.event_id is null then
    -- Sentinel row: signals "no live event for this host" to the client
    -- without leaking which subdomains exist or any event data.
    return query select
      null::uuid, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text,
      null::numeric(9,6), null::numeric(9,6),
      null::int, false;
    return;
  end if;

  return query
    select
      v.id          as venue_id,
      v.name        as name,
      v.description as description,
      v.address     as address,
      v.website_url as website_url,
      v.phone       as phone,
      v.logo_path   as logo_path,
      v.cover_path  as cover_path,
      v.lat         as lat,
      v.lng         as lng,
      v.order_index as order_index,
      true          as event_found
    from public.venues v
    where v.event_id   = r.event_id
      and v.status     = 'active'
      and v.deleted_at is null
    order by v.order_index nulls last, v.name;
end;
$$;

grant execute on function public.get_public_venues_by_domain(text)
  to anon, authenticated;

-- =============================================================================
-- 2) Detail RPC: get_public_venue_by_domain
-- =============================================================================
-- Adding offer_summary changes the function's return shape, so we drop and
-- recreate rather than `create or replace`. Returns zero rows if:
--   * host does not resolve to a live event
--   * venue is not in this event
--   * venue is inactive / soft-deleted
drop function if exists public.get_public_venue_by_domain(text, uuid);

create function public.get_public_venue_by_domain(
  _hostname text,
  _venue_id uuid
)
returns table (
  venue_id      uuid,
  name          text,
  description   text,
  address       text,
  website_url   text,
  phone         text,
  logo_path     text,
  cover_path    text,
  offer_summary text,
  lat           numeric,
  lng           numeric,
  order_index   integer
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
