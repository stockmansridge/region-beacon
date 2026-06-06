-- 07_fix_passports_deleted_at_reference.sql
--
-- Fix: the awards eligibility helper and the public awards RPC referenced
-- `passports.deleted_at`, which does not exist in the production
-- `public.passports` table (see migrations-draft/16_passports.sql — there
-- is no soft-delete column on passports). This caused:
--
--   ERROR: column p.deleted_at does not exist (SQLSTATE 42703)
--
-- Affected functions:
--   * public._event_award_eligible_passports(uuid)
--   * public.get_public_event_awards(uuid, uuid)
--
-- This patch only removes the bad predicates; all other behaviour
-- (active venue gating, points sum, all-locations rule, anonymous-viewer
-- fallback) is unchanged. Re-runnable via CREATE OR REPLACE.

begin;

-- =============================================================================
-- _event_award_eligible_passports — drop `and p.deleted_at is null`
-- =============================================================================
create or replace function public._event_award_eligible_passports(_award_id uuid)
returns table (
  passport_id     uuid,
  display_name    text,
  email           text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  aw record;
  v_active_venue_count int;
begin
  select id, event_id, agency_id, points_required,
         requires_all_locations, status, deleted_at
    into aw
  from public.event_awards
  where id = _award_id;

  if aw.id is null or aw.deleted_at is not null or aw.status <> 'active' then
    return;
  end if;

  select count(*)::int into v_active_venue_count
  from public.venues v
  where v.event_id = aw.event_id
    and v.status = 'active'
    and v.deleted_at is null;

  if aw.requires_all_locations and v_active_venue_count = 0 then
    return;
  end if;

  return query
  with passport_points as (
    select ppa.participant_id as passport_id,
           coalesce(sum(ppa.points_awarded), 0)::int as total_points
    from public.participant_point_awards ppa
    where ppa.event_id = aw.event_id
    group by ppa.participant_id
  ),
  passport_visits as (
    select c.passport_id,
           count(distinct c.venue_id)::int as visited_count
    from public.checkins c
    join public.venues v on v.id = c.venue_id
                        and v.status = 'active'
                        and v.deleted_at is null
    where c.event_id = aw.event_id
    group by c.passport_id
  )
  select
    p.id as passport_id,
    coalesce(nullif(trim(v.full_name), ''),
             nullif(trim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')), ''),
             'Guest') as display_name,
    v.email::text as email
  from public.passports p
  join public.visitors v on v.id = p.visitor_id
  left join passport_points pp on pp.passport_id = p.id
  left join passport_visits pv on pv.passport_id = p.id
  where p.event_id = aw.event_id
    and coalesce(pp.total_points, 0) >= aw.points_required
    and (
      aw.requires_all_locations = false
      or coalesce(pv.visited_count, 0) >= v_active_venue_count
    );
end;
$$;

grant execute on function public._event_award_eligible_passports(uuid) to authenticated;

-- =============================================================================
-- get_public_event_awards — drop `and deleted_at is null` on passports lookup
-- =============================================================================
create or replace function public.get_public_event_awards(
  p_event_id    uuid,
  p_passport_id uuid
)
returns table (
  id                       uuid,
  title                    text,
  description              text,
  image_url                text,
  points_required          integer,
  requires_all_locations   boolean,
  eligible_count           integer,
  passport_points          integer,
  passport_visited_count   integer,
  event_venue_count        integer,
  is_eligible              boolean,
  points_remaining         integer,
  needs_all_locations      boolean,
  sort_order               integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active_venue_count int;
  v_passport_points int := 0;
  v_passport_visited int := 0;
  v_passport_event uuid;
begin
  if p_passport_id is not null then
    select event_id into v_passport_event
    from public.passports
    where id = p_passport_id;
    if v_passport_event is null or v_passport_event <> p_event_id then
      p_passport_id := null;
    end if;
  end if;

  select count(*)::int into v_active_venue_count
  from public.venues v
  where v.event_id = p_event_id
    and v.status = 'active'
    and v.deleted_at is null;

  if p_passport_id is not null then
    select coalesce(sum(ppa.points_awarded), 0)::int
      into v_passport_points
    from public.participant_point_awards ppa
    where ppa.event_id = p_event_id
      and ppa.participant_id = p_passport_id;

    select count(distinct c.venue_id)::int
      into v_passport_visited
    from public.checkins c
    join public.venues v on v.id = c.venue_id
                        and v.status = 'active'
                        and v.deleted_at is null
    where c.event_id = p_event_id
      and c.passport_id = p_passport_id;
  end if;

  return query
  select
    a.id,
    a.title,
    a.description,
    a.image_url,
    a.points_required,
    a.requires_all_locations,
    (select count(*)::int from public._event_award_eligible_passports(a.id)) as eligible_count,
    v_passport_points        as passport_points,
    v_passport_visited       as passport_visited_count,
    v_active_venue_count     as event_venue_count,
    (
      p_passport_id is not null
      and v_passport_points >= a.points_required
      and (
        a.requires_all_locations = false
        or (v_active_venue_count > 0 and v_passport_visited >= v_active_venue_count)
      )
    ) as is_eligible,
    greatest(a.points_required - v_passport_points, 0)::int as points_remaining,
    (
      a.requires_all_locations
      and (v_active_venue_count = 0 or v_passport_visited < v_active_venue_count)
    ) as needs_all_locations,
    a.sort_order
  from public.event_awards a
  where a.event_id = p_event_id
    and a.deleted_at is null
    and a.status = 'active'
  order by
    a.points_required desc,
    case when a.requires_all_locations then 0 else 1 end,
    a.sort_order,
    a.title;
end;
$$;

grant execute on function public.get_public_event_awards(uuid, uuid)
  to authenticated, anon;

commit;

-- Verify:
-- select proname from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('_event_award_eligible_passports', 'get_public_event_awards');
