-- DRAFT — do not auto-apply. Run manually in the Supabase SQL editor.
--
-- Adds an optional `draw_date` to public.event_awards and threads it through
-- the admin and public award RPCs so the public Prizes page can display
-- "Draw date: 2 Nov 2026" and the admin editor can set/clear it.
--
-- Safe re-run: uses IF NOT EXISTS on the column and DROP FUNCTION on the
-- RPCs (return-shape changes cannot use CREATE OR REPLACE).
--
-- Depends on supabase/migrations-draft-event-awards/ (already applied on
-- staging/prod).

begin;

-- 1) Column ------------------------------------------------------------------

alter table public.event_awards
  add column if not exists draw_date date;

-- 2) Public RPC --------------------------------------------------------------

drop function if exists public.get_public_event_awards(uuid, uuid);

create function public.get_public_event_awards(
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
  sort_order               integer,
  draw_date                date
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
    a.sort_order,
    a.draw_date
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

-- 3) Admin list RPC ---------------------------------------------------------

drop function if exists public.get_event_awards_admin(uuid);

create function public.get_event_awards_admin(p_event_id uuid)
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
  latest_eligible_count    integer,
  draw_date                date
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
    l.latest_eligible_count,
    a.draw_date
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

-- 4) Admin save RPC — new overload that accepts p_draw_date -----------------
--
-- We add a NEW signature rather than replacing the existing one, so the app
-- can fall back to the old signature if this migration hasn't been applied.

create or replace function public.save_event_award(
  p_award_id               uuid,
  p_event_id               uuid,
  p_title                  text,
  p_description            text,
  p_image_url              text,
  p_points_required        integer,
  p_requires_all_locations boolean,
  p_status                 text,
  p_sort_order             integer,
  p_draw_date              date
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
      points_required, requires_all_locations, status, sort_order, draw_date
    ) values (
      p_event_id, v_agency_id, trim(p_title),
      nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_image_url, '')), ''),
      p_points_required, coalesce(p_requires_all_locations, false),
      p_status, coalesce(p_sort_order, 0), p_draw_date
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
          sort_order             = coalesce(p_sort_order, 0),
          draw_date              = p_draw_date
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

grant execute on function public.save_event_award(
  uuid, uuid, text, text, text, integer, boolean, text, integer, date
) to authenticated;

commit;
