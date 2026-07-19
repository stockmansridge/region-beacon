-- Draft migration: public read-only RPC returning the most recent
-- check-ins for an event, keyed by hostname. Returns first names only
-- (no email, no full name, no passport token). Safe for anon.
--
-- Apply in the Supabase SQL editor.

create or replace function public.get_public_event_recent_activity(
  _hostname text,
  _limit    int default 3
)
returns table(
  first_name  text,
  venue_name  text,
  award_title text,
  happened_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with resolved as (
    select event_id
    from public.resolve_event_by_host(_hostname)
    where kind = 'event' and event_id is not null
    limit 1
  ),
  base as (
    select
      c.created_at            as happened_at,
      coalesce(nullif(vs.first_name, ''), 'Someone') as first_name,
      v.name                   as venue_name
    from public.checkins c
    join resolved r on r.event_id = c.event_id
    join public.passports p on p.id = c.passport_id
    join public.visitors  vs on vs.id = p.visitor_id
    join public.venues    v on v.id = c.venue_id
    where c.created_at > now() - interval '24 hours'
    order by c.created_at desc
    limit greatest(coalesce(_limit, 3), 1)
  )
  select
    b.first_name,
    b.venue_name,
    null::text as award_title,
    b.happened_at
  from base b
  order by b.happened_at desc;
$$;

revoke all on function public.get_public_event_recent_activity(text, int) from public;
grant execute on function public.get_public_event_recent_activity(text, int) to anon, authenticated;
