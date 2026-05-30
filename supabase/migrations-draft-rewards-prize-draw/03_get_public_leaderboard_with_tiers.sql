-- 03_get_public_leaderboard_with_tiers.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Extends the public leaderboard RPC with `stamps`, `points`, `tier`, and
-- `is_completed`. Adding columns changes the return shape, so this DROPs
-- and re-CREATEs the function. Privacy projection is unchanged: no PII
-- columns are ever returned.
--
-- Tier resolution:
--   * If active reward_rules of type 'min_checkins' exist for the event,
--     each rule contributes a (threshold, reward_label). Visitor's `stamps`
--     (distinct stamped venues) maps to the highest satisfied threshold.
--   * Otherwise a default Bronze/Silver/Gold/Complete ladder is applied,
--     mirroring src/lib/passport-rewards.ts so client + server agree.
--
-- Depends on:
--   * 01_qr_and_checkin_entry_value.sql
--   * public.reward_rules (migrations-draft/19)
--   * public.leaderboard_settings (migrations-draft/21)
--   * public.resolve_event_by_host(text)

begin;

drop function if exists public.get_public_leaderboard_by_domain(text);

create function public.get_public_leaderboard_by_domain(_hostname text)
returns table (
  rank          int,
  display_name  text,
  stamps        int,
  points        int,
  visit_count   int,    -- alias of stamps for backwards compatibility
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
  v_has_custom_tiers boolean;
begin
  -- 1) Host resolution.
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return query select
      null::int, null::text, null::int, null::int, null::int,
      null::text, null::boolean, null::boolean, false;
    return;
  end if;

  -- 2) Settings gate.
  select * into s from public.leaderboard_settings where event_id = r.event_id;
  if not found or s.is_enabled = false then
    return query select
      null::int, null::text, null::int, null::int, null::int,
      null::text, null::boolean, false, true;
    return;
  end if;

  select count(*)::int into v_total_venues
  from public.venues v
  where v.event_id = r.event_id
    and v.status = 'active'
    and v.deleted_at is null;

  select exists (
    select 1 from public.reward_rules
    where event_id = r.event_id
      and is_active = true
      and rule_type = 'min_checkins'
      and threshold is not null
  ) into v_has_custom_tiers;

  -- Default tier ladder, mirroring src/lib/passport-rewards.ts.
  -- Used only when no min_checkins rules exist.
  --   Bronze: 3
  --   Silver: 5
  --   Gold:   min(8, total_venues)
  --   Complete: total_venues
  return query
  with per_passport as (
    select
      p.id                    as passport_id,
      p.visitor_id            as visitor_id,
      p.leaderboard_opt_out,
      coalesce(count(distinct c.venue_id) filter (where c.id is not null), 0)::int as stamps,
      coalesce(sum(c.entry_value), 0)::int as points
    from public.passports p
    left join public.checkins c on c.passport_id = p.id
    where p.event_id = r.event_id
    group by p.id, p.visitor_id, p.leaderboard_opt_out
  ),
  with_tier as (
    select
      pp.*,
      case
        when v_has_custom_tiers then (
          select rr.reward_label
          from public.reward_rules rr
          where rr.event_id = r.event_id
            and rr.is_active = true
            and rr.rule_type = 'min_checkins'
            and rr.threshold is not null
            and pp.stamps >= rr.threshold
          order by rr.threshold desc
          limit 1
        )
        else
          case
            when pp.stamps >= v_total_venues and v_total_venues > 0 then 'Complete'
            when pp.stamps >= least(8, greatest(v_total_venues, 1))  then 'Gold'
            when pp.stamps >= 5                                       then 'Silver'
            when pp.stamps >= 3                                       then 'Bronze'
            else null
          end
      end as tier,
      (v_total_venues > 0 and pp.stamps >= v_total_venues) as is_completed
    from per_passport pp
  ),
  filtered as (
    select
      wt.stamps,
      wt.points,
      wt.tier,
      wt.is_completed,
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
    from with_tier wt
    join public.visitors v on v.id = wt.visitor_id
    where wt.stamps >= s.hide_below_checkins
      and (
        s.allow_visitor_opt_out = false
        or wt.leaderboard_opt_out = false
      )
  )
  select
    dense_rank() over (order by f.points desc, f.stamps desc)::int   as rank,
    f.display_name                                                   as display_name,
    f.stamps                                                         as stamps,
    f.points                                                         as points,
    case when s.show_visit_count then f.stamps else null end         as visit_count,
    f.tier                                                           as tier,
    f.is_completed                                                   as is_completed,
    true                                                             as is_enabled,
    true                                                             as event_found
  from filtered f
  order by f.points desc, f.stamps desc, f.display_name asc;
end;
$$;

grant execute on function public.get_public_leaderboard_by_domain(text)
  to anon, authenticated;

commit;

-- Rollback: re-apply the previous body from
-- supabase/migrations-draft-public-leaderboard/01_get_public_leaderboard_by_domain.sql
-- (drop function first since this version's return shape is wider).
