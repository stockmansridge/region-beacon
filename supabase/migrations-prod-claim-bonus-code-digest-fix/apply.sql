-- Production fix: claim_bonus_code fails with
--   42883 -- function digest(text, unknown) does not exist
--
-- Cause: the function body calls `digest(_passport_token, 'sha256')`
-- unqualified. pgcrypto lives in the `extensions` schema on Supabase,
-- and this function's search_path is `public`, so digest() is not
-- resolvable and the RPC aborts.
--
-- Fix: schema-qualify the call as `extensions.digest(...::text, 'sha256'::text)`,
-- matching every other passport-token lookup RPC (redeem_checkin_*, qr_entry,
-- etc.). No behaviour change; same input, same output shape as the previous
-- ambiguous-fix migration.

begin;

create or replace function public.claim_bonus_code(
  _token text,
  _passport_token text
)
returns table (
  success boolean,
  already_collected boolean,
  event_id uuid,
  bonus_code_id uuid,
  bonus_code_name text,
  points_awarded integer,
  total_points integer,
  venue_points integer,
  bonus_points integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  p record;
  v_awarded int := 0;
  v_already boolean := false;
  v_inserted bigint := 0;
  v_total int := 0;
  v_venue_total int := 0;
  v_bonus_total int := 0;
begin
  -- 1. Resolve bonus code + event status.
  select bc.id as bonus_id, bc.agency_id, bc.event_id as b_event_id, bc.name,
         bc.points_value, bc.is_active,
         e.status as event_status
    into b
  from public.event_bonus_codes bc
  join public.events e on e.id = bc.event_id
  where bc.qr_code_token = _token;

  if b.bonus_id is null then
    return query select
      false, false, null::uuid, null::uuid, null::text,
      0, 0, 0, 0,
      'Bonus code not found.'::text;
    return;
  end if;

  if not b.is_active then
    return query select
      false, false, b.b_event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This bonus code is no longer active.'::text;
    return;
  end if;

  if b.event_status <> 'published' then
    return query select
      false, false, b.b_event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This event is not currently live.'::text;
    return;
  end if;

  -- 2. Resolve passport via access token.
  select pp.id as passport_id, pp.agency_id, pp.event_id as p_event_id
    into p
  from public.passports pp
  where pp.access_token_hash = extensions.digest(_passport_token::text, 'sha256'::text);

  if p.passport_id is null then
    return query select
      false, false, b.b_event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'Passport not found.'::text;
    return;
  end if;

  -- 3. Tenant integrity.
  if p.p_event_id <> b.b_event_id or p.agency_id <> b.agency_id then
    return query select
      false, false, b.b_event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This bonus code is for a different event.'::text;
    return;
  end if;

  -- 4. Insert points award (idempotent via unique index).
  insert into public.participant_point_awards (
    agency_id, event_id, participant_id,
    award_type, source_id, points_awarded, metadata
  )
  values (
    p.agency_id, p.p_event_id, p.passport_id,
    'bonus', b.bonus_id, coalesce(b.points_value, 0),
    jsonb_build_object('bonus_code_id', b.bonus_id, 'bonus_code_name', b.name)
  )
  on conflict (event_id, participant_id, award_type, source_id)
  where source_id is not null
  do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    v_awarded := coalesce(b.points_value, 0);
    v_already := false;
  else
    v_awarded := 0;
    v_already := true;
  end if;

  -- 5. Totals.
  select coalesce(sum(ppa.points_awarded), 0)::int,
         coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'venue'), 0)::int,
         coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'bonus'), 0)::int
    into v_total, v_venue_total, v_bonus_total
  from public.participant_point_awards ppa
  where ppa.event_id = b.b_event_id and ppa.participant_id = p.passport_id;

  return query select
    true,
    v_already,
    b.b_event_id,
    b.bonus_id,
    b.name,
    v_awarded,
    v_total,
    v_venue_total,
    v_bonus_total,
    case
      when v_already then 'Already collected'
      else 'Bonus points collected'
    end::text;
end;
$$;

revoke all on function public.claim_bonus_code(text, text) from public;
grant execute on function public.claim_bonus_code(text, text) to anon, authenticated;

commit;
