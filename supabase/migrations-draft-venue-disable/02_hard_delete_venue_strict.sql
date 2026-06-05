-- GetStampd venue lifecycle: strengthen hard_delete_venue (DRAFT)
-- Project: kyjwifumacnrpgyextzz
--
-- Replaces hard_delete_venue with a strict dependency-aware version that
-- introspects information_schema at runtime to find EVERY table in the
-- public schema with a foreign key to public.venues(id) (single-column or
-- composite). If any of those tables holds at least one row referencing
-- this venue, deletion is blocked with the canonical error message.
--
-- This is future-proof: any new table added later with a venue_id FK will
-- automatically be checked without needing to update this function.
--
-- Idempotent and additive.

create or replace function public.hard_delete_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  r           record;
  v_count     bigint;
  v_blockers  text[] := array[]::text[];
begin
  select agency_id
    into v_agency_id
  from public.venues
  where id = p_venue_id;

  if v_agency_id is null then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  if not public._can_manage_agency_venue(v_agency_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Discover every (table, column) in the public schema whose foreign key
  -- references public.venues(id). Works for single-column FKs as well as
  -- composite FKs (e.g. (agency_id, event_id, venue_id) -> venues(...,id)),
  -- because we match on the specific column that targets venues.id.
  for r in
    select
      tc.table_schema as schema_name,
      tc.table_name   as table_name,
      kcu.column_name as column_name
    from information_schema.referential_constraints rc
    join information_schema.table_constraints tc
      on tc.constraint_name = rc.constraint_name
     and tc.constraint_schema = rc.constraint_schema
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
    join information_schema.key_column_usage rcu
      on rcu.constraint_name = rc.unique_constraint_name
     and rcu.constraint_schema = rc.unique_constraint_schema
     and rcu.ordinal_position = kcu.position_in_unique_constraint
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and rcu.table_schema = 'public'
      and rcu.table_name = 'venues'
      and rcu.column_name = 'id'
  loop
    execute format(
      'select count(*) from %I.%I where %I = $1',
      r.schema_name, r.table_name, r.column_name
    )
    into v_count
    using p_venue_id;

    if v_count > 0 then
      v_blockers := v_blockers || format('%s(%s)', r.table_name, v_count);
    end if;
  end loop;

  if array_length(v_blockers, 1) is not null then
    raise exception
      'This venue cannot be permanently deleted because it is linked to existing events or historical activity. Disable it instead.'
      using
        errcode = 'foreign_key_violation',
        detail  = 'Referenced by: ' || array_to_string(v_blockers, ', ');
  end if;

  delete from public.venues where id = p_venue_id;
end;
$$;

grant execute on function public.hard_delete_venue(uuid) to authenticated;
