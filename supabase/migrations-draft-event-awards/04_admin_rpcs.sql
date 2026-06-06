-- 04_admin_rpcs.sql — DRAFT only.
--
-- Admin RPCs for event awards. All SECURITY DEFINER, gated by
-- public.can_admin_event(event_id) (defined in
-- supabase/migrations-draft-rewards-prize-draw/05_admin_prize_draw_rpcs.sql).

begin;

-- =============================================================================
-- Internal: build the eligible-passport set for an award at call time.
-- Returns one row per eligible passport with display name + email so it
-- can feed both the count RPC and the draw RPC.
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

  -- If the award requires all locations but there are no active venues,
  -- no one is eligible.
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
    and p.deleted_at is null
    and coalesce(pp.total_points, 0) >= aw.points_required
    and (
      aw.requires_all_locations = false
      or coalesce(pv.visited_count, 0) >= v_active_venue_count
    );
end;
$$;

grant execute on function public._event_award_eligible_passports(uuid) to authenticated;

-- =============================================================================
-- get_event_awards_admin
-- =============================================================================
create or replace function public.get_event_awards_admin(p_event_id uuid)
returns table (
  id                       uuid,
  event_id                 uuid,
  agency_id                uuid,
  title                    text,
  description              text,
  image_url                text,
  points_required          integer,
  requires_all_locations   boolean,
  status                   text,
  sort_order               integer,
  created_at               timestamptz,
  updated_at               timestamptz,
  eligible_count           integer,
  latest_draw_id           uuid,
  latest_drawn_at          timestamptz,
  latest_winner_name       text,
  latest_winner_email      text,
  latest_eligible_count    integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_admin_event(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with latest as (
    select distinct on (d.award_id)
      d.award_id,
      d.id              as latest_draw_id,
      d.drawn_at        as latest_drawn_at,
      d.winner_participant_name  as latest_winner_name,
      d.winner_participant_email as latest_winner_email,
      d.eligible_count  as latest_eligible_count
    from public.event_award_draws d
    where d.event_id = p_event_id
    order by d.award_id, d.drawn_at desc
  )
  select
    a.id,
    a.event_id,
    a.agency_id,
    a.title,
    a.description,
    a.image_url,
    a.points_required,
    a.requires_all_locations,
    a.status,
    a.sort_order,
    a.created_at,
    a.updated_at,
    (select count(*)::int from public._event_award_eligible_passports(a.id)) as eligible_count,
    l.latest_draw_id,
    l.latest_drawn_at,
    l.latest_winner_name,
    l.latest_winner_email,
    l.latest_eligible_count
  from public.event_awards a
  left join latest l on l.award_id = a.id
  where a.event_id = p_event_id
    and a.deleted_at is null
  order by
    case when a.status = 'active' then 0 else 1 end,
    a.points_required desc,
    case when a.requires_all_locations then 0 else 1 end,
    a.sort_order,
    a.title;
end;
$$;

grant execute on function public.get_event_awards_admin(uuid) to authenticated;

-- =============================================================================
-- save_event_award
-- =============================================================================
create or replace function public.save_event_award(
  p_award_id               uuid,
  p_event_id               uuid,
  p_title                  text,
  p_description            text,
  p_image_url              text,
  p_points_required        integer,
  p_requires_all_locations boolean,
  p_status                 text,
  p_sort_order             integer
)
returns public.event_awards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_row public.event_awards;
begin
  if not public.can_admin_event(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title_required';
  end if;
  if p_points_required is null or p_points_required < 0 then
    raise exception 'points_required_invalid';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'status_invalid';
  end if;

  select agency_id into v_agency_id
  from public.events
  where id = p_event_id;

  if v_agency_id is null then
    raise exception 'event_not_found';
  end if;

  if p_award_id is null then
    insert into public.event_awards (
      event_id, agency_id, title, description, image_url,
      points_required, requires_all_locations, status, sort_order
    ) values (
      p_event_id, v_agency_id, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_image_url, '')), ''),
      p_points_required, coalesce(p_requires_all_locations, false),
      p_status, coalesce(p_sort_order, 0)
    )
    returning * into v_row;
  else
    update public.event_awards
      set title                  = trim(p_title),
          description            = nullif(trim(coalesce(p_description, '')), ''),
          image_url              = nullif(trim(coalesce(p_image_url, '')), ''),
          points_required        = p_points_required,
          requires_all_locations = coalesce(p_requires_all_locations, false),
          status                 = p_status,
          sort_order             = coalesce(p_sort_order, 0)
      where id = p_award_id
        and event_id = p_event_id
        and deleted_at is null
      returning * into v_row;
    if v_row.id is null then
      raise exception 'award_not_found';
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.save_event_award(uuid, uuid, text, text, text, integer, boolean, text, integer)
  to authenticated;

-- =============================================================================
-- delete_event_award — soft delete
-- =============================================================================
create or replace function public.delete_event_award(p_award_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  select event_id into v_event_id
  from public.event_awards
  where id = p_award_id and deleted_at is null;
  if v_event_id is null then
    raise exception 'award_not_found';
  end if;
  if not public.can_admin_event(v_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.event_awards
    set deleted_at = now(),
        status     = 'disabled'
    where id = p_award_id;
end;
$$;

grant execute on function public.delete_event_award(uuid) to authenticated;

-- =============================================================================
-- draw_event_award_winner
-- =============================================================================
create or replace function public.draw_event_award_winner(p_award_id uuid)
returns table (
  draw_id                    uuid,
  award_title                text,
  winner_passport_id         uuid,
  winner_participant_name    text,
  winner_participant_email   text,
  eligible_count             integer,
  drawn_at                   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  aw record;
  v_winner record;
  v_total int;
  v_new_id uuid;
  v_drawn_at timestamptz;
begin
  select id, event_id, agency_id, title, status, deleted_at
    into aw
  from public.event_awards
  where id = p_award_id;

  if aw.id is null then
    raise exception 'award_not_found';
  end if;
  if not public.can_admin_event(aw.event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if aw.deleted_at is not null or aw.status <> 'active' then
    raise exception 'award_inactive';
  end if;

  select count(*)::int into v_total
  from public._event_award_eligible_passports(p_award_id);

  if v_total = 0 then
    raise exception 'No eligible participants are currently in this award draw.';
  end if;

  select * into v_winner
  from public._event_award_eligible_passports(p_award_id)
  order by random()
  limit 1;

  insert into public.event_award_draws (
    award_id, event_id, agency_id,
    winner_passport_id, winner_participant_name, winner_participant_email,
    eligible_count, drawn_by
  ) values (
    aw.id, aw.event_id, aw.agency_id,
    v_winner.passport_id, v_winner.display_name, v_winner.email,
    v_total, auth.uid()
  )
  returning id, drawn_at into v_new_id, v_drawn_at;

  return query select
    v_new_id,
    aw.title,
    v_winner.passport_id,
    v_winner.display_name,
    v_winner.email,
    v_total,
    v_drawn_at;
end;
$$;

grant execute on function public.draw_event_award_winner(uuid) to authenticated;

-- =============================================================================
-- get_event_award_draws_admin
-- =============================================================================
create or replace function public.get_event_award_draws_admin(p_event_id uuid)
returns table (
  id                         uuid,
  award_id                   uuid,
  award_title                text,
  points_required            integer,
  requires_all_locations     boolean,
  winner_participant_name    text,
  winner_participant_email   text,
  eligible_count             integer,
  drawn_by                   uuid,
  drawn_at                   timestamptz,
  notes                      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_admin_event(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.award_id,
    a.title              as award_title,
    a.points_required,
    a.requires_all_locations,
    d.winner_participant_name,
    d.winner_participant_email,
    d.eligible_count,
    d.drawn_by,
    d.drawn_at,
    d.notes
  from public.event_award_draws d
  join public.event_awards a on a.id = d.award_id
  where d.event_id = p_event_id
  order by d.drawn_at desc;
end;
$$;

grant execute on function public.get_event_award_draws_admin(uuid) to authenticated;

commit;
