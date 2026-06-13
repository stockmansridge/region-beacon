-- Production migration: admin-only undo/void for award winner draws.
--
-- Adds soft-void columns to public.event_award_draws, an RPC to perform the
-- void (gated by can_admin_event), and updates the two admin read RPCs so
-- voided draws stay visible (flagged) but no longer count as "latest" for the
-- award card / eligibility view.
--
-- Run via Supabase SQL editor or deploy pipeline. Idempotent.

begin;

-- 1. Schema -------------------------------------------------------------------
alter table public.event_award_draws
  add column if not exists voided_at  timestamptz null,
  add column if not exists voided_by  uuid        null references auth.users(id),
  add column if not exists void_reason text       null;

create index if not exists idx_event_award_draws_active
  on public.event_award_draws (award_id, drawn_at desc)
  where voided_at is null;

-- 2. void_event_award_draw RPC -----------------------------------------------
create or replace function public.void_event_award_draw(
  p_draw_id uuid,
  p_reason  text default null
)
returns table (
  id          uuid,
  award_id    uuid,
  event_id    uuid,
  voided_at   timestamptz,
  voided_by   uuid,
  void_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  select ead.id, ead.event_id, ead.voided_at
    into d
  from public.event_award_draws ead
  where ead.id = p_draw_id;

  if d.id is null then
    raise exception 'draw_not_found';
  end if;

  if not public.can_admin_event(d.event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if d.voided_at is not null then
    raise exception 'draw_already_voided';
  end if;

  return query
  update public.event_award_draws ead
     set voided_at   = now(),
         voided_by   = auth.uid(),
         void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where ead.id = p_draw_id
   returning ead.id, ead.award_id, ead.event_id,
             ead.voided_at, ead.voided_by, ead.void_reason;
end;
$$;

grant execute on function public.void_event_award_draw(uuid, text) to authenticated;

-- 3. get_event_award_draws_admin — include void status -----------------------
drop function if exists public.get_event_award_draws_admin(uuid);

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
  notes                      text,
  voided_at                  timestamptz,
  voided_by                  uuid,
  void_reason                text
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
    d.notes,
    d.voided_at,
    d.voided_by,
    d.void_reason
  from public.event_award_draws d
  join public.event_awards a on a.id = d.award_id
  where d.event_id = p_event_id
  order by d.drawn_at desc;
end;
$$;

grant execute on function public.get_event_award_draws_admin(uuid) to authenticated;

-- 4. get_event_awards_admin — "latest" must ignore voided draws --------------
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
      and d.voided_at is null
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

commit;
