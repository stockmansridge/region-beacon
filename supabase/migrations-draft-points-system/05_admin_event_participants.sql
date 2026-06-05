-- Points System Stage 6: Admin participant reporting RPC.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Adds:
--   public.get_admin_event_participants_with_points(p_event_id uuid)
--
-- Returns one row per passport (participant) for the event with:
--   - identity fields from public.visitors (full name, email, mobile)
--   - passport_stamp_count: distinct checked-in venues
--   - total_points / venue_points / bonus_points: sum from participant_point_awards
--   - bonus_codes_claimed: distinct bonus source_ids
--   - latest_activity_at: max of last checkin or last award
--   - created_at: passport creation timestamp
--
-- Access:
--   SECURITY DEFINER, gated to platform admin OR agency member for the
--   event's agency. Anonymous callers are rejected.

create or replace function public.get_admin_event_participants_with_points(
  p_event_id uuid
)
returns table (
  passport_id              uuid,
  visitor_id               uuid,
  display_name             text,
  email                    text,
  mobile                   text,
  passport_stamp_count     integer,
  total_points             integer,
  venue_points             integer,
  bonus_points             integer,
  bonus_codes_claimed      integer,
  latest_activity_at       timestamptz,
  created_at               timestamptz,
  passport_status          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
begin
  select e.agency_id into v_agency_id
  from public.events e
  where e.id = p_event_id;

  if v_agency_id is null then
    raise exception 'event_not_found';
  end if;

  if not (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), v_agency_id)
  ) then
    raise exception 'forbidden';
  end if;

  return query
  with stamp_counts as (
    select
      c.passport_id,
      count(distinct c.venue_id)::integer as passport_stamp_count,
      max(c.created_at)                   as latest_checkin_at
    from public.checkins c
    where c.event_id = p_event_id
    group by c.passport_id
  ),
  point_counts as (
    select
      ppa.participant_id as passport_id,
      coalesce(sum(ppa.points_awarded), 0)::integer as total_points,
      coalesce(sum(ppa.points_awarded)
        filter (where ppa.award_type = 'venue'), 0)::integer as venue_points,
      coalesce(sum(ppa.points_awarded)
        filter (where ppa.award_type = 'bonus'), 0)::integer as bonus_points,
      count(distinct ppa.source_id)
        filter (where ppa.award_type = 'bonus')::integer as bonus_codes_claimed,
      max(ppa.awarded_at) as latest_award_at
    from public.participant_point_awards ppa
    where ppa.event_id = p_event_id
    group by ppa.participant_id
  )
  select
    p.id            as passport_id,
    p.visitor_id    as visitor_id,
    coalesce(nullif(trim(v.full_name), ''),
             trim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')),
             'Guest') as display_name,
    v.email::text   as email,
    v.mobile        as mobile,
    coalesce(sc.passport_stamp_count, 0)::integer as passport_stamp_count,
    coalesce(pc.total_points, 0)::integer         as total_points,
    coalesce(pc.venue_points, 0)::integer         as venue_points,
    coalesce(pc.bonus_points, 0)::integer         as bonus_points,
    coalesce(pc.bonus_codes_claimed, 0)::integer  as bonus_codes_claimed,
    nullif(
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ) as latest_activity_at,
    p.created_at    as created_at,
    p.status        as passport_status
  from public.passports p
  join public.visitors v
    on v.id = p.visitor_id
  left join stamp_counts sc on sc.passport_id = p.id
  left join point_counts pc on pc.passport_id = p.id
  where p.event_id = p_event_id
    and v.deleted_at is null
  order by
    coalesce(pc.total_points, 0) desc,
    coalesce(sc.passport_stamp_count, 0) desc,
    coalesce(
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ),
      'infinity'::timestamptz
    ) asc,
    lower(coalesce(v.full_name, '')) asc;
end;
$$;

revoke all on function public.get_admin_event_participants_with_points(uuid) from public;
grant execute on function public.get_admin_event_participants_with_points(uuid) to authenticated;

-- =====================================================================
-- Verification
-- =====================================================================
--   select * from public.get_admin_event_participants_with_points('<event_id>'::uuid);
