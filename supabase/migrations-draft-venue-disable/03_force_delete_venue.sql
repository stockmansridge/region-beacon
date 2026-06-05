-- GetStampd venue lifecycle: platform-admin force delete (DRAFT)
-- Project: kyjwifumacnrpgyextzz
--
-- Adds a DESTRUCTIVE force_delete_venue RPC for platform-admin testing /
-- cleanup. Unlike hard_delete_venue, this RPC is allowed to delete a venue
-- that has linked history (check-ins, QR codes, offers, etc.) by first
-- removing every row in every table that has a FK to public.venues(id),
-- then deleting the venue row itself.
--
-- Safety rails:
--   * SECURITY DEFINER, but the body REQUIRES public.is_platform_admin(auth.uid()).
--     Normal organisation admins (agency_owner / agency_admin) are NOT allowed.
--   * Requires the caller to pass the exact confirmation phrase
--     'DELETE VENUE AND HISTORY' as p_confirm_text. Any other value is rejected.
--   * The safe hard_delete_venue RPC is unchanged and remains the default for
--     normal organisation admins.
--
-- Idempotent and additive.

create or replace function public.force_delete_venue(
  p_venue_id    uuid,
  p_confirm_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  r           record;
  v_rows      bigint;
  v_log       text[] := array[]::text[];
begin
  -- Platform-admin only. Normal org admins must use hard_delete_venue.
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden: platform admin only' using errcode = '42501';
  end if;

  -- Strong confirmation phrase, exact match.
  if p_confirm_text is null or p_confirm_text <> 'DELETE VENUE AND HISTORY' then
    raise exception
      'force_delete_venue requires the exact confirmation text: DELETE VENUE AND HISTORY'
      using errcode = '22023';
  end if;

  select agency_id
    into v_agency_id
  from public.venues
  where id = p_venue_id;

  if v_agency_id is null then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  -- Discover every public-schema (table, column) whose foreign key targets
  -- public.venues(id), then DELETE matching rows. Matches single-column and
  -- composite FKs (we delete only the rows that point at this venue.id).
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
      -- Don't try to delete venues from itself via a self-FK.
      and tc.table_name <> 'venues'
  loop
    execute format(
      'delete from %I.%I where %I = $1',
      r.schema_name, r.table_name, r.column_name
    )
    using p_venue_id;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_log := v_log || format('%s=%s', r.table_name, v_rows);
    end if;
  end loop;

  delete from public.venues where id = p_venue_id;

  -- Surface a NOTICE so the destructive action leaves an audit breadcrumb
  -- in the Postgres logs alongside the caller's auth.uid().
  raise notice
    'force_delete_venue: venue=% agency=% by=% deleted=[%]',
    p_venue_id, v_agency_id, auth.uid(), array_to_string(v_log, ', ');
end;
$$;

grant execute on function public.force_delete_venue(uuid, text) to authenticated;
