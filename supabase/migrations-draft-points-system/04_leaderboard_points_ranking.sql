-- Points System Stage 5: Public leaderboard ranked by total points.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Replaces public.get_public_leaderboard_by_domain so it:
--   * ranks by total_points DESC, then passport_stamp_count DESC, then
--     earliest latest_activity_at, then lower(display_name)
--   * keeps passport stamp count visible as `stamps` (and `visit_count`
--     for backwards compatibility with older clients)
--   * surfaces venue_points + bonus_points so the UI can break the total
--     down later
--   * INCLUDES participants who have bonus points but no venue stamps
--   * still respects leaderboard_settings.display_mode,
--     allow_visitor_opt_out, show_visit_count, and hide_below_checkins
--     (hide_below_checkins is bypassed for participants who have any
--     points, so a bonus-only participant cannot be hidden by it)
--
-- The return signature gains columns, so we drop the old function first.
-- All call sites already select by name and treat new columns as optional.

begin;

drop function if exists public.get_public_leaderboard_by_domain(text);

create or replace function public.get_public_leaderboard_by_domain(_hostname text)
returns table (
  rank          int,
  display_name  text,
  visit_count   int,
  stamps        int,
  points        int,
  venue_points  int,
  bonus_points  int,
  is_enabled    boolean,
  event_found   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  s public.leaderboard_settings%rowtype;
begin
  -- 1) Host resolution. Publishing gate already enforced inside
  --    resolve_event_by_host.
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return query select
      null::int, null::text, null::int, null::int,
      null::int, null::int, null::int,
      null::boolean, false;
    return;
  end if;

  -- 2) Leaderboard settings gate.
  select * into s from public.leaderboard_settings where event_id = r.event_id;
  if not found or s.is_enabled = false then
    return query select
      null::int, null::text, null::int, null::int,
      null::int, null::int, null::int,
      false, true;
    return;
  end if;

  -- 3) Safe projection. No PII columns selected.
  return query
  with stamp_counts as (
    select
      c.passport_id,
      count(distinct c.venue_id)::int as stamp_cnt,
      max(c.created_at)               as latest_checkin_at
    from public.checkins c
    where c.event_id = r.event_id
    group by c.passport_id
  ),
  point_counts as (
    select
      ppa.participant_id as passport_id,
      coalesce(sum(ppa.points_awarded), 0)::int as total_points,
      coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'venue'), 0)::int as venue_points,
      coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'bonus'), 0)::int as bonus_points,
      max(ppa.awarded_at) as latest_award_at
    from public.participant_point_awards ppa
    where ppa.event_id = r.event_id
    group by ppa.participant_id
  ),
  base as (
    select
      p.id          as passport_id,
      p.visitor_id  as visitor_id,
      p.leaderboard_opt_out,
      coalesce(sc.stamp_cnt, 0)        as stamp_cnt,
      coalesce(pc.total_points, 0)     as total_points,
      coalesce(pc.venue_points, 0)     as venue_points,
      coalesce(pc.bonus_points, 0)     as bonus_points,
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ) as latest_activity_at
    from public.passports p
    left join stamp_counts sc on sc.passport_id = p.id
    left join point_counts pc on pc.passport_id = p.id
    where p.event_id = r.event_id
  ),
  filtered as (
    select
      base.*,
      case s.display_mode
        when 'anonymous'       then 'Anonymous'
        when 'alias_only'      then coalesce(v.first_name, 'Guest')
        when 'first_name_only' then coalesce(v.first_name, 'Guest')
        else  -- 'first_name_last_initial'
          coalesce(case when s.show_first_name then v.first_name end, 'Guest')
          || case
               when s.show_last_initial
                    and v.last_name is not null
                    and length(v.last_name) > 0
                 then ' ' || upper(left(v.last_name, 1)) || '.'
               else ''
             end
      end as display_name
    from base
    join public.visitors v on v.id = base.visitor_id
    where
      -- Must have something to show: any stamps OR any points.
      (base.stamp_cnt > 0 or base.total_points > 0)
      -- hide_below_checkins applies to stamp-only participants. Anyone
      -- with points is always eligible regardless of the threshold so
      -- bonus-only participants are never hidden by the stamp gate.
      and (
        base.total_points > 0
        or base.stamp_cnt >= s.hide_below_checkins
      )
      and (
        s.allow_visitor_opt_out = false
        or base.leaderboard_opt_out = false
      )
  )
  select
    dense_rank() over (
      order by
        f.total_points desc,
        f.stamp_cnt    desc,
        f.latest_activity_at asc,
        lower(f.display_name) asc
    )::int as rank,
    f.display_name as display_name,
    -- visit_count kept for backwards compatibility with older clients
    case when s.show_visit_count then f.stamp_cnt else null end as visit_count,
    f.stamp_cnt        as stamps,
    f.total_points     as points,
    f.venue_points     as venue_points,
    f.bonus_points     as bonus_points,
    true               as is_enabled,
    true               as event_found
  from filtered f
  order by
    f.total_points desc,
    f.stamp_cnt    desc,
    f.latest_activity_at asc,
    lower(f.display_name) asc;
end;
$$;

grant execute on function public.get_public_leaderboard_by_domain(text)
  to anon, authenticated;

commit;

-- =====================================================================
-- Verification
-- =====================================================================
-- 1. Ranking: participant A has 10 venue points + 1 stamp; participant B
--    has 25 bonus points + 0 stamps. Expect B at rank 1, A at rank 2.
-- 2. Stamp tie-breaker: both at 20 points, A has 2 stamps and B has 1.
--    Expect A above B.
-- 3. Earliest-activity tie-breaker: equal points and equal stamps → the
--    participant whose latest activity timestamp is EARLIER ranks higher
--    (rewards reaching the score first).
-- 4. Duplicate scan: re-scanning the same venue or bonus token does not
--    change ranks (idempotent via unique index on participant_point_awards).
-- 5. Bonus-only: a participant with bonus_points > 0 and stamp_cnt = 0
--    appears even if leaderboard_settings.hide_below_checkins is > 0.
