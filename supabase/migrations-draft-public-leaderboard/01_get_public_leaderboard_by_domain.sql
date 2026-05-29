-- 01_get_public_leaderboard_by_domain.sql
-- DRAFT ONLY. Do not execute.
--
-- Public, privacy-safe leaderboard lookup keyed by hostname. Designed for
-- the future /live/$subdomain/leaderboard route. The function:
--   * resolves the host via public.resolve_event_by_host()
--   * returns sentinel rows for not-found / disabled so the client can
--     render the correct empty state without leaking data
--   * formats display_name server-side from first_name + last initial
--   * never selects email, mobile, postcode, full_name, visitor id,
--     passport id, or token hash
--
-- Depends on (already drafted):
--   * public.resolve_event_by_host(text)
--       — see migrations-draft/32_rpcs_public.sql, refined by
--         migrations-draft-domain-rename/02_resolve_event_by_host.sql and
--         migrations-draft-publishing-gate/01_resolve_event_by_host_publishable.sql
--   * public.leaderboard_settings      (migrations-draft/21)
--   * public.passports.leaderboard_opt_out (migrations-draft/16)
--   * public.visitors                  (migrations-draft/15)
--   * public.checkins                  (migrations-draft/18)
--
-- SECURITY: SECURITY DEFINER with explicit search_path. No SELECT *. Only
-- the projected columns below leave the function.

begin;

create or replace function public.get_public_leaderboard_by_domain(_hostname text)
returns table (
  rank         int,
  display_name text,
  visit_count  int,
  is_enabled   boolean,
  event_found  boolean
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
  -- 1) Host resolution. Publishing gate is already enforced inside
  --    resolve_event_by_host (see publishing-gate draft).
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return query select
      null::int, null::text, null::int,
      null::boolean, false;
    return;
  end if;

  -- 2) Leaderboard settings gate.
  select * into s from public.leaderboard_settings where event_id = r.event_id;
  if not found or s.is_enabled = false then
    return query select
      null::int, null::text, null::int,
      false, true;
    return;
  end if;

  -- 3) Safe projection. No PII columns selected.
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
    from counts
    join public.visitors v on v.id = counts.visitor_id
    where counts.cnt >= s.hide_below_checkins
      and (
        s.allow_visitor_opt_out = false
        or counts.leaderboard_opt_out = false
      )
  )
  select
    dense_rank() over (order by f.cnt desc)::int            as rank,
    f.display_name                                          as display_name,
    case when s.show_visit_count then f.cnt else null end   as visit_count,
    true                                                    as is_enabled,
    true                                                    as event_found
  from filtered f
  order by f.cnt desc, f.display_name asc;
end;
$$;

-- Public-facing RPC: callable by anon and authenticated. Returns only the
-- safe projection above.
grant execute on function public.get_public_leaderboard_by_domain(text)
  to anon, authenticated;

commit;
