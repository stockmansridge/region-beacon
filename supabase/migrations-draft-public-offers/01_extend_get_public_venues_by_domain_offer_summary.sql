-- 01_extend_get_public_venues_by_domain_offer_summary.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Adds offer_summary text to the projection of
-- public.get_public_venues_by_domain(text). Today the public Offers page
-- (/offers) works by calling the venue detail RPC once per venue to read
-- offer_summary. That's correct but produces N+1 round-trips. Extending
-- the list RPC reduces /offers to a single round-trip.
--
-- Adding a column changes the function's return shape, so we drop and
-- recreate rather than `create or replace`.
--
-- SECURITY: SECURITY DEFINER with explicit search_path. No SELECT *.
-- Only the projected columns below leave the function. Still filters to
-- v.status = 'active' AND v.deleted_at IS NULL. No PII, no admin fields.

begin;

drop function if exists public.get_public_venues_by_domain(text);

create function public.get_public_venues_by_domain(_hostname text)
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
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' or r.event_id is null then
    return query select
      null::uuid, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text,
      null::numeric(9,6), null::numeric(9,6),
      null::int, false;
    return;
  end if;

  return query
    select
      v.id            as venue_id,
      v.name          as name,
      v.description   as description,
      v.address       as address,
      v.website_url   as website_url,
      v.phone         as phone,
      v.logo_path     as logo_path,
      v.cover_path    as cover_path,
      v.offer_summary as offer_summary,
      v.lat           as lat,
      v.lng           as lng,
      v.order_index   as order_index,
      true            as event_found
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

commit;

-- Rollback: drop and re-create the prior version (without offer_summary)
-- from supabase/migrations-draft-public-venue-pages/01_get_public_venues_by_domain.sql.
