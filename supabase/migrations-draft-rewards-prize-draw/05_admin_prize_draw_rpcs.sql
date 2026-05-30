-- 05_admin_prize_draw_rpcs.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Admin-only RPCs for prize draws.
--
-- Trust model:
--   * SECURITY DEFINER + explicit search_path.
--   * Role gate inside the function body via public.can_admin_event().
--   * Never exposed to anon. Service role keys are NOT used in any client.
--
-- Entrant model:
--   * For each passport in the event with at least one checkin, sum
--     checkins.entry_value to get entries (weight).
--   * Respect prize_rules.max_entries_per_passport when set.
--   * If prize_rules.requires_completion = true, only count passports
--     that have stamped every active venue.
--   * If prize_rules.threshold_checkins is set, exclude passports with
--     fewer stamped venues than the threshold.
--
-- Selection method — deterministic, hash-based, weighted:
--   * Conceptually each passport holds `entries` tickets numbered
--     1..entries. For each ticket compute
--         h = sha256( seed::text || ':' || passport_id::text || ':' || ticket_index )
--     The winning ticket is the one with the lexicographically smallest
--     hash across the whole pool. Each ticket's hash is an i.i.d. uniform
--     draw from a 2^256 space, so a passport's win probability is exactly
--     entries / total_entries.
--   * No setseed(), no random(), no session state. Same (seed, pool)
--     deterministically produces the same winner — even across servers
--     and Postgres versions — and is trivial to reproduce offline.
--   * The pool snapshot used to compute the winner is persisted into
--     prize_draw_results.pool_snapshot so the draw remains auditable
--     after future check-ins.
--
-- Depends on:
--   * 01_qr_and_checkin_entry_value.sql
--   * 04_prize_draw_results.sql
--   * public.has_role(uuid, app_role) helper
--   * public.agency_members (for agency_owner/admin gate)
--   * pgcrypto (for digest())

begin;

-- =============================================================================
-- Role helper: caller can administer the given event?
-- =============================================================================
create or replace function public.can_admin_event(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.has_role(auth.uid(), 'platform_admin'), false)
    or exists (
      select 1
      from public.events e
      join public.agency_members am
        on am.agency_id = e.agency_id
       and am.user_id   = auth.uid()
       and am.role in ('agency_owner', 'agency_admin')
      where e.id = _event_id
    )
$$;

grant execute on function public.can_admin_event(uuid) to authenticated;

-- Read policy for prize_draw_results (admin UI listing).
drop policy if exists pdr_read_admin on public.prize_draw_results;
create policy pdr_read_admin on public.prize_draw_results
  for select to authenticated
  using (public.can_admin_event(event_id));

-- =============================================================================
-- admin_get_prize_draw_pool — entrant list for a prize rule.
-- =============================================================================
create or replace function public.admin_get_prize_draw_pool(
  _event_id uuid,
  _prize_rule_id uuid
)
returns table (
  passport_id     uuid,
  visitor_id      uuid,
  display_name    text,
  stamps          int,
  entries         int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pr record;
  v_total_venues int;
begin
  if not public.can_admin_event(_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select pr2.id, pr2.event_id, pr2.threshold_checkins,
         pr2.requires_completion, pr2.max_entries_per_passport
    into pr
  from public.prize_rules pr2
  where pr2.id = _prize_rule_id and pr2.event_id = _event_id;

  if pr.id is null then
    raise exception 'prize_rule_not_found';
  end if;

  select count(*)::int into v_total_venues
  from public.venues v
  where v.event_id = _event_id
    and v.status = 'active'
    and v.deleted_at is null;

  return query
  with per_passport as (
    select
      p.id            as passport_id,
      p.visitor_id    as visitor_id,
      count(distinct c.venue_id) filter (where c.id is not null)::int as stamps,
      coalesce(sum(c.entry_value), 0)::int as raw_entries
    from public.passports p
    left join public.checkins c on c.passport_id = p.id
    where p.event_id = _event_id
    group by p.id, p.visitor_id
  )
  select
    pp.passport_id,
    pp.visitor_id,
    coalesce(v.first_name, 'Guest')
      || case
           when v.last_name is not null and length(v.last_name) > 0
             then ' ' || upper(left(v.last_name, 1)) || '.'
           else ''
         end                                                          as display_name,
    pp.stamps,
    case
      when pr.max_entries_per_passport is not null
        then least(pp.raw_entries, pr.max_entries_per_passport)
      else pp.raw_entries
    end                                                               as entries
  from per_passport pp
  join public.visitors v on v.id = pp.visitor_id
  where pp.stamps >= coalesce(pr.threshold_checkins, 1)
    and (pr.requires_completion = false or pp.stamps >= v_total_venues)
    and pp.raw_entries >= 1
  order by entries desc, passport_id;
end;
$$;

grant execute on function public.admin_get_prize_draw_pool(uuid, uuid)
  to authenticated;

-- =============================================================================
-- admin_draw_prize_winner — deterministic hash-based weighted winner pick.
-- =============================================================================
-- _seed is optional; when null a fresh uuid is generated. The same seed
-- with the same pool always reproduces the same winner. The pool
-- snapshot is stored on the result row so the draw remains auditable
-- after future check-ins change the live pool.
create or replace function public.admin_draw_prize_winner(
  _event_id uuid,
  _prize_rule_id uuid,
  _seed uuid default null
)
returns table (
  result_id              uuid,
  winner_passport_id     uuid,
  winner_visitor_id      uuid,
  winner_display_name    text,
  winner_entries         int,
  pool_size              int,
  total_entries          int,
  seed                   uuid,
  selected_entry_number  int,
  selected_hash          text,
  drawn_at               timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed uuid;
  v_total int;
  v_pool int;
  v_winner record;
  v_agency uuid;
  v_email text;
  v_result_id uuid;
  v_snapshot jsonb;
begin
  if not public.can_admin_event(_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select agency_id into v_agency from public.events where id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;

  v_seed := coalesce(_seed, gen_random_uuid());

  -- 1) Materialise the pool deterministically (ordered by passport_id).
  create temp table _draw_pool on commit drop as
  select * from public.admin_get_prize_draw_pool(_event_id, _prize_rule_id);

  select count(*)::int, coalesce(sum(entries), 0)::int
    into v_pool, v_total
  from _draw_pool;

  if v_pool = 0 or v_total = 0 then
    raise exception 'empty_pool';
  end if;

  -- 2) Build the ticket-level table and hash each ticket deterministically.
  --    hash = sha256(seed || ':' || passport_id || ':' || ticket_index)
  --    Winner = ticket with the smallest hash.
  with tickets as (
    select
      dp.passport_id,
      dp.visitor_id,
      dp.display_name,
      dp.stamps,
      dp.entries,
      gs.ticket_index,
      encode(
        digest(
          v_seed::text || ':' || dp.passport_id::text || ':' || gs.ticket_index::text,
          'sha256'
        ),
        'hex'
      ) as ticket_hash
    from _draw_pool dp
    cross join lateral generate_series(1, dp.entries) as gs(ticket_index)
  ),
  ranked as (
    select
      t.*,
      row_number() over (order by t.ticket_hash asc, t.passport_id, t.ticket_index) as global_ticket_number
    from tickets t
  )
  select * into v_winner
  from ranked
  order by ticket_hash asc, passport_id, ticket_index
  limit 1;

  if v_winner.passport_id is null then
    raise exception 'draw_failed';
  end if;

  -- 3) Look up winner email (admin-only context; not exposed publicly).
  select email into v_email
  from public.visitors
  where id = v_winner.visitor_id;

  -- 4) Snapshot the pool (without PII beyond display_name) for audit.
  select coalesce(jsonb_agg(jsonb_build_object(
           'passport_id',  dp.passport_id,
           'visitor_id',   dp.visitor_id,
           'display_name', dp.display_name,
           'stamps',       dp.stamps,
           'entries',      dp.entries
         ) order by dp.passport_id), '[]'::jsonb)
    into v_snapshot
  from _draw_pool dp;

  -- 5) Persist audit row.
  insert into public.prize_draw_results (
    agency_id, event_id, prize_rule_id,
    winner_passport_id, winner_visitor_id, winner_display_name, winner_email,
    winner_entries,
    seed, total_eligible_passports, total_entries,
    selected_entry_number, selected_hash,
    pool_snapshot, drawn_by
  ) values (
    v_agency, _event_id, _prize_rule_id,
    v_winner.passport_id, v_winner.visitor_id, v_winner.display_name, v_email,
    v_winner.entries,
    v_seed, v_pool, v_total,
    v_winner.global_ticket_number::int, v_winner.ticket_hash,
    v_snapshot, auth.uid()
  )
  returning id into v_result_id;

  return query
    select v_result_id,
           v_winner.passport_id,
           v_winner.visitor_id,
           v_winner.display_name,
           v_winner.entries,
           v_pool,
           v_total,
           v_seed,
           v_winner.global_ticket_number::int,
           v_winner.ticket_hash,
           now();
end;
$$;

grant execute on function public.admin_draw_prize_winner(uuid, uuid, uuid)
  to authenticated;

commit;

-- Rollback notes:
--   begin;
--   drop function if exists public.admin_draw_prize_winner(uuid, uuid, uuid);
--   drop function if exists public.admin_get_prize_draw_pool(uuid, uuid);
--   drop policy   if exists pdr_read_admin on public.prize_draw_results;
--   drop function if exists public.can_admin_event(uuid);
--   commit;
