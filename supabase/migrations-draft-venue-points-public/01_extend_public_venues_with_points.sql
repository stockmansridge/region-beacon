-- 01_extend_public_venues_with_points.sql
-- DRAFT. Extends public venues list RPC to surface venues.points_value so
-- public venue cards can render "earn N pts / N pts earned" text.
--
-- Adds a single new column to the returned table; existing callers that
-- ignore the new column are unaffected. Re-create required because the
-- returns-table shape changes.

begin;

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
  points_value                     integer,
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
      null::integer,
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
      coalesce(v.points_value, 0)       as points_value,
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

commit;
