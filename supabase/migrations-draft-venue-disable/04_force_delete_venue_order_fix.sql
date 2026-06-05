-- GetStampd venue lifecycle: fix force_delete_venue delete order (DRAFT)
-- Project: kyjwifumacnrpgyextzz
--
-- Supersedes the delete loop body in 03_force_delete_venue.sql.
--
-- Bug fix: the previous version discovered every FK-to-venues table and
-- deleted them in arbitrary information_schema order. That broke when
-- public.checkins.venue_qr_code_id has a `RESTRICT` FK to
-- public.venue_qr_codes (constraint `checkins_qr_fk`). If venue_qr_codes
-- was deleted before checkins, Postgres aborted with:
--
--   update or delete on table "venue_qr_codes" violates foreign key
--   constraint "checkins_qr_fk" on table "checkins"
--
-- Schema dependency graph for a single venue today (public schema):
--
--   public.checkins
--     -> public.venues       (checkins_venue_fk,   on delete RESTRICT)
--     -> public.venue_qr_codes (checkins_qr_fk,   on delete RESTRICT)
--     -> public.events, public.passports, public.visitors  (unrelated to venue cleanup)
--   public.venue_qr_codes
--     -> public.venues       (on delete CASCADE)
--   public.venue_offers
--     -> public.venues       (on delete CASCADE)
--
-- So checkins (a grandchild via venue_qr_codes) must be deleted BEFORE the
-- per-venue rows in venue_qr_codes. We do this in two phases:
--   Phase 1: explicitly delete public.checkins for this venue, so no row in
--            checkins still references a venue_qr_codes row we are about to
--            remove. This is the only known grandchild today.
--   Phase 2: dynamically discover every other public-schema table with a FK
--            to public.venues(id) and delete matching rows. This is
--            future-proof for new direct venue dependents (e.g. labels,
--            reward configs, public-profile metadata).
--   Phase 3: delete the public.venues row itself. CASCADE FKs on
--            venue_qr_codes / venue_offers clean up automatically, but Phase
--            2 already cleared them so the venues delete is a single row.
--
-- If a future schema change adds another grandchild that references one of
-- the venue-linked tables with `ON DELETE RESTRICT`, that table MUST be
-- added to Phase 1 below. The function will raise the underlying
-- foreign_key_violation message verbatim so the failure is obvious in the UI.
--
-- Idempotent and additive. Replaces only the function body.

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

  -- ------------------------------------------------------------------------
  -- Phase 1: delete grandchild rows that reference venue-linked tables with
  --          ON DELETE RESTRICT. Today this is only public.checkins, which
  --          references public.venue_qr_codes via checkins_qr_fk.
  -- ------------------------------------------------------------------------
  delete from public.checkins where venue_id = p_venue_id;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    v_log := v_log || format('checkins=%s', v_rows);
  end if;

  -- ------------------------------------------------------------------------
  -- Phase 2: discover every remaining public-schema (table, column) whose
  --          foreign key targets public.venues(id) and DELETE matching rows.
  --          Skips:
  --            * public.venues itself (self-FKs)
  --            * public.checkins (already handled in Phase 1)
  -- ------------------------------------------------------------------------
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
      and tc.table_name not in ('venues', 'checkins')
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

  -- ------------------------------------------------------------------------
  -- Phase 3: delete the venue row itself.
  -- ------------------------------------------------------------------------
  delete from public.venues where id = p_venue_id;

  -- Audit breadcrumb in the Postgres log next to the caller's auth.uid().
  raise notice
    'force_delete_venue: venue=% agency=% by=% deleted=[%]',
    p_venue_id, v_agency_id, auth.uid(), array_to_string(v_log, ', ');
end;
$$;

grant execute on function public.force_delete_venue(uuid, text) to authenticated;
