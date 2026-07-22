-- Draft migration: extend the public "what's happening" and "recent
-- activity" RPCs to include prize unlocks (award_type = 'prize' entries
-- in participant_point_awards). Safe for anon: returns first names only,
-- no email / no passport token.
--
-- Apply in the Supabase SQL editor.

create or replace function public.get_public_event_happening_now(
  _hostname text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_event_id uuid;
  v_tz text;
  v_recent_checkins jsonb;
  v_explorers_today int;
  v_recent_bonus jsonb;
  v_recent_prize_unlocks jsonb;
begin
  select r.event_id
    into v_event_id
  from public.resolve_event_by_host(_hostname) r
  where r.kind = 'event' and r.event_id is not null
  limit 1;

  if v_event_id is null then
    return jsonb_build_object(
      'recent_checkins', '[]'::jsonb,
      'explorers_today', 0,
      'recent_bonus', '[]'::jsonb,
      'recent_prize_unlocks', '[]'::jsonb
    );
  end if;

  select coalesce(nullif(e.timezone, ''), 'UTC')
    into v_tz
  from public.events e
  where e.id = v_event_id;

  -- Recent check-ins (last 15, past 24h) — bumped so the client can group by venue.
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.happened_at desc), '[]'::jsonb)
    into v_recent_checkins
  from (
    select
      c.created_at as happened_at,
      coalesce(nullif(vs.first_name, ''), 'Someone') as first_name,
      case
        when coalesce(nullif(vs.last_name, ''), '') = '' then null
        else upper(left(vs.last_name, 1))
      end as last_initial,
      v.name as venue_name
    from public.checkins c
    join public.passports p on p.id = c.passport_id
    join public.visitors vs on vs.id = p.visitor_id
    join public.venues v on v.id = c.venue_id
    where c.event_id = v_event_id
      and c.created_at > now() - interval '24 hours'
    order by c.created_at desc
    limit 15
  ) t;

  -- Explorers today (distinct passports with check-in since local midnight).
  select count(distinct c.passport_id)::int
    into v_explorers_today
  from public.checkins c
  where c.event_id = v_event_id
    and c.created_at >= (date_trunc('day', (now() at time zone v_tz)) at time zone v_tz);

  -- Recent bonus code claims (last 3, past 24h).
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.happened_at desc), '[]'::jsonb)
    into v_recent_bonus
  from (
    select
      ppa.awarded_at as happened_at,
      coalesce(nullif(vs.first_name, ''), 'Someone') as first_name,
      coalesce(
        nullif(ppa.metadata->>'bonus_code_name', ''),
        'a hidden bonus'
      ) as bonus_name,
      coalesce(ppa.points_awarded, 0) as points_awarded
    from public.participant_point_awards ppa
    join public.passports p on p.id = ppa.participant_id
    join public.visitors vs on vs.id = p.visitor_id
    where ppa.event_id = v_event_id
      and ppa.award_type = 'bonus'
      and ppa.awarded_at > now() - interval '24 hours'
    order by ppa.awarded_at desc
    limit 3
  ) t;

  -- Recent prize unlocks (last 3, past 24h).
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.happened_at desc), '[]'::jsonb)
    into v_recent_prize_unlocks
  from (
    select
      ppa.awarded_at as happened_at,
      coalesce(nullif(vs.first_name, ''), 'Someone') as first_name,
      coalesce(
        nullif(ppa.metadata->>'award_name', ''),
        nullif(ppa.metadata->>'prize_name', ''),
        ea.title,
        'a prize'
      ) as prize_name,
      coalesce(ppa.points_awarded, 0) as points_awarded
    from public.participant_point_awards ppa
    join public.passports p on p.id = ppa.participant_id
    join public.visitors vs on vs.id = p.visitor_id
    left join public.event_awards ea
      on ea.id = nullif(ppa.metadata->>'award_id', '')::uuid
    where ppa.event_id = v_event_id
      and ppa.award_type = 'prize'
      and ppa.awarded_at > now() - interval '24 hours'
    order by ppa.awarded_at desc
    limit 3
  ) t;

  return jsonb_build_object(
    'recent_checkins', coalesce(v_recent_checkins, '[]'::jsonb),
    'explorers_today', coalesce(v_explorers_today, 0),
    'recent_bonus', coalesce(v_recent_bonus, '[]'::jsonb),
    'recent_prize_unlocks', coalesce(v_recent_prize_unlocks, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_event_happening_now(text) from public;
grant execute on function public.get_public_event_happening_now(text) to anon, authenticated;

-- Extend the ticker feed so prize unlocks appear alongside check-ins.
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
  checkins_feed as (
    select
      coalesce(nullif(vs.first_name, ''), 'Someone') as first_name,
      v.name                   as venue_name,
      null::text               as award_title,
      c.created_at             as happened_at
    from public.checkins c
    join resolved r on r.event_id = c.event_id
    join public.passports p on p.id = c.passport_id
    join public.visitors  vs on vs.id = p.visitor_id
    join public.venues    v on v.id = c.venue_id
    where c.created_at > now() - interval '24 hours'
  ),
  unlocks_feed as (
    select
      coalesce(nullif(vs.first_name, ''), 'Someone') as first_name,
      null::text                                     as venue_name,
      coalesce(
        nullif(ppa.metadata->>'award_name', ''),
        nullif(ppa.metadata->>'prize_name', ''),
        ea.title,
        'a prize'
      )                                              as award_title,
      ppa.awarded_at                                 as happened_at
    from public.participant_point_awards ppa
    join resolved r on r.event_id = ppa.event_id
    join public.passports p on p.id = ppa.participant_id
    join public.visitors  vs on vs.id = p.visitor_id
    left join public.event_awards ea
      on ea.id = nullif(ppa.metadata->>'award_id', '')::uuid
    where ppa.award_type = 'prize'
      and ppa.awarded_at > now() - interval '24 hours'
  ),
  merged as (
    select * from checkins_feed
    union all
    select * from unlocks_feed
  )
  select first_name, venue_name, award_title, happened_at
  from merged
  order by happened_at desc
  limit greatest(coalesce(_limit, 3), 1);
$$;

revoke all on function public.get_public_event_recent_activity(text, int) from public;
grant execute on function public.get_public_event_recent_activity(text, int) to anon, authenticated;

notify pgrst, 'reload schema';
