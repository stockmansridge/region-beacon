-- 01_get_public_leaderboard_by_domain_no_entry_value.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Production failure:
--   ERROR 42703: column c.entry_value does not exist
--   while executing public.get_public_leaderboard_by_domain(text)
--
-- The currently-deployed function (rewards-prize-draw draft 03) references
-- checkins.entry_value, but that column has never been migrated to prod.
-- This patch replaces the function with a compatibility version that:
--   * Returns the SAME row shape (rank, display_name, stamps, points,
--     visit_count, tier, is_completed, is_enabled, event_found) so the
--     existing /leaderboard client keeps working unchanged.
--   * Counts each check-in as 1 stamp / 1 point (points = stamps). This
--     matches default beta behaviour where every QR scan is worth 1.
--   * Uses the default Bronze / Silver / Gold / Complete tier ladder
--     against the total venue count (mirrors src/lib/passport-rewards.ts).
--   * Does NOT reference checkins.entry_value or venue_qr_codes.entry_value
--     anywhere, so it is safe regardless of whether those columns exist.
--   * Preserves SECURITY DEFINER, search_path, grants, and the existing
--     privacy projection (no email / phone / postcode / full name).
--
-- Data impact: NONE. Function definition only.
-- Rollback: re-apply the previous CREATE FUNCTION body, or drop and recreate
--           from migrations-draft-public-leaderboard/01.

begin;

drop function if exists public.get_public_leaderboard_by_domain(text);

create function public.get_public_leaderboard_by_domain(_hostname text)
returns table (
  rank          int,
  display_name  text,
  stamps        int,
  points        int,
  visit_count   int,
  tier          text,
  is_completed  boolean,
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
  v_total_venues int;
begin
  -- 1) Host resolution (publish gate already applied inside the resolver).
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return query select
      null::int, null::text, null::int, null::int, null::int,
      null::text, null::boolean, null::boolean, false;
    return;
  end if;

  -- 2) Leaderboard settings gate.
  select * into s from public.leaderboard_settings where event_id = r.event_id;
  if not found or s.is_enabled = false then
    return query select
      null::int, null::text, null::int, null::int, null::int,
      null::text, false, false, true;
    return;
  end if;

  -- 3) Total venues for the default tier ladder.
  select count(*)::int into v_total_venues
  from public.venues
  where event_id = r.event_id;

  -- 4) Safe projection. No PII columns. Each check-in counts as 1.
  return query
  with counts as (
    select
      p.id          as passport_id,
      p.visitor_id  as visitor_id,
      p.leaderboard_opt_out,
      count(c.*)::int as cnt
    from public.passports p
    left join public.checkins c on c.passport_id = p.id
    where p.event_id = r.event_id
    group by p.id, p.visitor_id, p.leaderboard_opt_out
  ),
  filtered as (
    select
      counts.cnt,
      case s.display_mode
        when 'anonymous'       then 'Anonymous'
        when 'alias_only'      then coalesce(v.first_name, 'Guest')
        when 'first_name_only' then coalesce(v.first_name, 'Guest')
        else
          coalesce(case when s.show_first_name then v.first_name end, 'Guest')
          || case
               when s.show_last_initial
                    and v.last_name is not null
                    and length(v.last_name) > 0
                 then ' ' || upper(left(v.last_name, 1)) || '.'
               else ''
             end
      end as display_name
    from counts
    join public.visitors v on v.id = counts.visitor_id
    where counts.cnt >= s.hide_below_checkins
      and (
        s.allow_visitor_opt_out = false
        or counts.leaderboard_opt_out = false
      )
  )
  select
    dense_rank() over (order by f.cnt desc)::int                       as rank,
    f.display_name                                                     as display_name,
    f.cnt                                                              as stamps,
    f.cnt                                                              as points,
    case when s.show_visit_count then f.cnt else null end              as visit_count,
    case
      when v_total_venues > 0 and f.cnt >= v_total_venues then 'complete'
      when v_total_venues >= 3 and f.cnt >= greatest(1, (v_total_venues * 2) / 3) then 'gold'
      when v_total_venues >= 2 and f.cnt >= greatest(1, v_total_venues / 2)       then 'silver'
      when f.cnt >= 1                                                              then 'bronze'
      else null
    end                                                                as tier,
    (v_total_venues > 0 and f.cnt >= v_total_venues)                   as is_completed,
    true                                                               as is_enabled,
    true                                                               as event_found
  from filtered f
  order by f.cnt desc, f.display_name asc;
end;
$$;

grant execute on function public.get_public_leaderboard_by_domain(text)
  to anon, authenticated;

commit;
