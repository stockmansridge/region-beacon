-- Draft migration: public read-only RPC returning a bundle of "what's
-- happening" data for a public event home page — recent check-ins,
-- explorers today, recent bonus code claims. Returns first names +
-- last initial only (no email, no full name, no passport token).
-- Safe for anon.
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
      'recent_bonus', '[]'::jsonb
    );
  end if;

  select coalesce(nullif(e.timezone, ''), 'UTC')
    into v_tz
  from public.events e
  where e.id = v_event_id;

  -- Recent check-ins (last 5, past 24h).
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
    limit 5
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
      ppa.created_at as happened_at,
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
      and ppa.created_at > now() - interval '24 hours'
    order by ppa.created_at desc
    limit 3
  ) t;

  return jsonb_build_object(
    'recent_checkins', coalesce(v_recent_checkins, '[]'::jsonb),
    'explorers_today', coalesce(v_explorers_today, 0),
    'recent_bonus', coalesce(v_recent_bonus, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_event_happening_now(text) from public;
grant execute on function public.get_public_event_happening_now(text) to anon, authenticated;

notify pgrst, 'reload schema';
