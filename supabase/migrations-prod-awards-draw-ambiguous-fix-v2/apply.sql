-- Production hotfix v2: draw_event_award_winner ambiguous "drawn_at"
--
-- Symptom (Admin Awards → Draw winner):
--   code 42702 -- column reference "drawn_at" is ambiguous
--
-- The earlier hotfix in ../migrations-prod-awards-draw-ambiguous-fix/apply.sql
-- never reached production, so the live function still contains the broken
-- `RETURNING drawn_at INTO drawn_at` form. There may also be a stale overload.
--
-- This script:
--   1. Inspects every overload of public.draw_event_award_winner.
--   2. Drops every overload so no stale definition can be resolved.
--   3. Re-creates the canonical (uuid) signature with the ambiguity fixed:
--        - local timestamp renamed to v_drawn_at_ts
--        - INSERT aliased as ead; RETURNING ead.id, ead.drawn_at
--        - OUT columns aliased in the final RETURN QUERY SELECT
--   4. Re-runs the inspection so the operator can confirm the new body.
--
-- SECURITY DEFINER and `set search_path = public` are preserved.
-- The (uuid) signature the frontend calls is preserved.

-- 1. Pre-inspection -----------------------------------------------------------
select
  n.nspname  as schema_name,
  p.proname  as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid)                 as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'draw_event_award_winner';

begin;

-- 2. Drop every overload ------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select 'public.' || quote_ident(p.proname)
        || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'draw_event_award_winner'
  loop
    raise notice 'dropping %', r.sig;
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end
$$;

-- 3. Re-create the canonical signature ----------------------------------------
create function public.draw_event_award_winner(p_award_id uuid)
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
  aw            record;
  v_winner      record;
  v_total       int;
  v_new_id      uuid;
  v_drawn_at_ts timestamptz;
begin
  select ea.id, ea.event_id, ea.agency_id, ea.title, ea.status, ea.deleted_at
    into aw
  from public.event_awards ea
  where ea.id = p_award_id;

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

  insert into public.event_award_draws as ead (
    award_id, event_id, agency_id,
    winner_passport_id, winner_participant_name, winner_participant_email,
    eligible_count, drawn_by
  ) values (
    aw.id, aw.event_id, aw.agency_id,
    v_winner.passport_id, v_winner.display_name, v_winner.email,
    v_total, auth.uid()
  )
  returning ead.id, ead.drawn_at into v_new_id, v_drawn_at_ts;

  return query select
    v_new_id              as draw_id,
    aw.title              as award_title,
    v_winner.passport_id  as winner_passport_id,
    v_winner.display_name as winner_participant_name,
    v_winner.email        as winner_participant_email,
    v_total               as eligible_count,
    v_drawn_at_ts         as drawn_at;
end;
$$;

grant execute on function public.draw_event_award_winner(uuid) to authenticated;

commit;

-- 4. Post-inspection — confirm a single overload with the fixed body ---------
select
  n.nspname  as schema_name,
  p.proname  as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid)                 as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'draw_event_award_winner';

-- Expect: exactly one row, arguments = 'p_award_id uuid',
-- and the definition must NOT contain `RETURNING drawn_at INTO drawn_at`.
-- It MUST contain `RETURNING ead.id, ead.drawn_at INTO v_new_id, v_drawn_at_ts`.
