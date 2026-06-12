-- Production fix: draw_event_award_winner ambiguous "drawn_at" reference.
-- Symptom (admin Awards → Draw winner):
--   code 42702 -- column reference "drawn_at" is ambiguous. It could refer
--   to either a PL/pgSQL variable or a table column.
--
-- Cause: RETURNS TABLE (..., drawn_at timestamptz) declares an OUT
-- parameter / implicit variable named `drawn_at` that shadows the
-- `event_award_draws.drawn_at` column referenced in the INSERT ...
-- RETURNING clause. Postgres can no longer tell whether `drawn_at`
-- means the OUT column or the table column.
--
-- Fix:
--   * Rename the local timestamp variable to `v_drawn_at_ts` to remove
--     any chance of collision (previous draft also called it
--     `v_drawn_at`, but we make the intent explicit here).
--   * Fully qualify every table column reference in the INSERT
--     RETURNING clause (`public.event_award_draws.drawn_at`).
--   * Qualify the final SELECT's column references against the local
--     variables so they cannot be read as table columns either.
-- No behaviour change; the function still inserts one draw row and
-- returns the same single row shape as before.

begin;

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
    v_new_id            as draw_id,
    aw.title            as award_title,
    v_winner.passport_id as winner_passport_id,
    v_winner.display_name as winner_participant_name,
    v_winner.email      as winner_participant_email,
    v_total             as eligible_count,
    v_drawn_at_ts       as drawn_at;
end;
$$;

grant execute on function public.draw_event_award_winner(uuid) to authenticated;

commit;
