-- migrations-prod-admin-delete-participant/apply.sql
--
-- Adds public.admin_delete_event_participant(p_event_id uuid, p_passport_id uuid)
-- so an agency admin (or platform admin) can hard-delete a single participant
-- from an event end-to-end: check-ins, visitor consents, point awards,
-- passport, and the visitor record itself.
--
-- Safe to re-run. Uses to_regclass() so it tolerates optional tables
-- (prize_draw_results, event_award_draws) that may not exist in every
-- environment.

begin;

create or replace function public.admin_delete_event_participant(
  p_event_id uuid,
  p_passport_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agency_id uuid;
  v_visitor_id uuid;
  v_count int;
  v_prize_passport_column text;
  v_award_passport_column text;
begin
  if p_event_id is null or p_passport_id is null then
    raise exception 'event_id and passport_id are required.' using errcode = '22023';
  end if;

  select p.agency_id, p.visitor_id
    into v_agency_id, v_visitor_id
  from public.passports p
  where p.id = p_passport_id
    and p.event_id = p_event_id;

  if v_agency_id is null then
    raise exception 'Participant not found for this event.' using errcode = 'P0002';
  end if;

  if not (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), v_agency_id)
  ) then
    raise exception 'Only agency admins can delete participants.' using errcode = '42501';
  end if;

  -- Preserve audit history: refuse if this passport won a prize draw
  -- (either table may or may not exist depending on migrations applied).
  if to_regclass('public.prize_draw_results') is not null then
    -- Production schemas have not all used the same local column name for
    -- the passport FK. Resolve the column from the FK to passports(id), with
    -- safe fallbacks for older schemas, instead of assuming winner_passport_id.
    select child_att.attname
      into v_prize_passport_column
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality child_key(attnum, ord) on true
    join lateral unnest(c.confkey) with ordinality parent_key(attnum, ord) on parent_key.ord = child_key.ord
    join pg_attribute child_att on child_att.attrelid = c.conrelid and child_att.attnum = child_key.attnum
    join pg_attribute parent_att on parent_att.attrelid = c.confrelid and parent_att.attnum = parent_key.attnum
    where c.contype = 'f'
      and c.conrelid = 'public.prize_draw_results'::regclass
      and c.confrelid = 'public.passports'::regclass
      and parent_att.attname = 'id'
    limit 1;

    if v_prize_passport_column is null then
      select column_name
        into v_prize_passport_column
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'prize_draw_results'
        and column_name in ('winner_passport_id', 'passport_id', 'participant_id')
      order by case column_name
        when 'winner_passport_id' then 1
        when 'passport_id' then 2
        when 'participant_id' then 3
        else 4
      end
      limit 1;
    end if;

    if v_prize_passport_column is not null then
      execute format('select count(*) from public.prize_draw_results where %I = $1', v_prize_passport_column)
        into v_count using p_passport_id;
      if v_count > 0 then
        raise exception 'Cannot delete: this participant is recorded as a prize draw winner. Remove the draw result first or archive instead.'
          using errcode = '23503';
      end if;
    end if;
  end if;

  if to_regclass('public.event_award_draws') is not null then
    select child_att.attname
      into v_award_passport_column
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality child_key(attnum, ord) on true
    join lateral unnest(c.confkey) with ordinality parent_key(attnum, ord) on parent_key.ord = child_key.ord
    join pg_attribute child_att on child_att.attrelid = c.conrelid and child_att.attnum = child_key.attnum
    join pg_attribute parent_att on parent_att.attrelid = c.confrelid and parent_att.attnum = parent_key.attnum
    where c.contype = 'f'
      and c.conrelid = 'public.event_award_draws'::regclass
      and c.confrelid = 'public.passports'::regclass
      and parent_att.attname = 'id'
    limit 1;

    if v_award_passport_column is null then
      select column_name
        into v_award_passport_column
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'event_award_draws'
        and column_name in ('winner_passport_id', 'passport_id', 'participant_id')
      order by case column_name
        when 'winner_passport_id' then 1
        when 'passport_id' then 2
        when 'participant_id' then 3
        else 4
      end
      limit 1;
    end if;

    if v_award_passport_column is not null then
      execute format('select count(*) from public.event_award_draws where %I = $1', v_award_passport_column)
        into v_count using p_passport_id;
      if v_count > 0 then
        raise exception 'Cannot delete: this participant is recorded as an award winner. Remove the award draw first or archive instead.'
          using errcode = '23503';
      end if;
    end if;
  end if;

  -- Break restrict FKs on passports.
  delete from public.checkins
   where passport_id = p_passport_id;

  if to_regclass('public.visitor_consents') is not null then
    delete from public.visitor_consents
     where passport_id = p_passport_id;
  end if;

  if to_regclass('public.venue_tasting_qr_claims') is not null then
    delete from public.venue_tasting_qr_claims
     where passport_id = p_passport_id;
  end if;

  if to_regclass('public.participant_point_awards') is not null then
    delete from public.participant_point_awards
     where participant_id = p_passport_id;
  end if;

  -- Cascades from passports handle any remaining child rows; from
  -- visitors also cascades passports. Delete the passport explicitly
  -- first, then the visitor row.
  delete from public.passports
   where id = p_passport_id;

  delete from public.visitors
   where id = v_visitor_id
     and event_id = p_event_id;
end;
$$;

revoke all on function public.admin_delete_event_participant(uuid, uuid) from public;
grant execute on function public.admin_delete_event_participant(uuid, uuid) to authenticated;

commit;
