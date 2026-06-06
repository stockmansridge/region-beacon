-- 05_public_rpcs.sql — DRAFT only.
--
-- Public-safe RPC for the passport Awards page.
--
-- Returns only counts and the current passport holder's eligibility
-- status. Never returns winner PII. Soft-deleted awards and
-- non-active awards are hidden.

begin;

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
  -- Confirm the passport belongs to the event (defence in depth; the
  -- public passport context is derived client-side).
  if p_passport_id is not null then
    select event_id into v_passport_event
    from public.passports
    where id = p_passport_id;
    if v_passport_event is null or v_passport_event <> p_event_id then
      -- Treat as anonymous viewer.
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
