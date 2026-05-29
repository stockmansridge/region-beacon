-- 34_rpcs_admin.sql
-- Draft only. Do not execute.
-- Admin RPCs. SECURITY DEFINER, explicit search_path.
-- Every function verifies caller via agency_id-scoped helpers.

-- Rotate the active QR token for a venue.
create or replace function public.rotate_venue_qr(_venue_id uuid)
returns text                                  -- new token (raw)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_token text;
begin
  select id, agency_id, event_id into v
  from public.venues where id = _venue_id;
  if v.id is null then
    raise exception 'venue_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v.agency_id)) then
    raise exception 'forbidden';
  end if;

  v_token := replace(replace(replace(encode(gen_random_bytes(24), 'base64'),'+','-'),'/','_'),'=','');

  update public.venue_qr_codes
    set status = 'revoked', revoked_at = now()
  where venue_id = _venue_id and status = 'active';

  insert into public.venue_qr_codes (
    agency_id, event_id, venue_id, token, status, created_by
  ) values (v.agency_id, v.event_id, _venue_id, v_token, 'active', auth.uid());

  return v_token;
end;
$$;

-- Evaluate which prize rules a passport currently satisfies.
create or replace function public.evaluate_prize_eligibility(_passport_id uuid)
returns table (
  prize_rule_id uuid,
  prize_type text,
  eligible boolean,
  entry_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  cnt int;
begin
  select agency_id, event_id, status into p
  from public.passports where id = _passport_id;
  if p.event_id is null then
    raise exception 'passport_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_member(auth.uid(), p.agency_id)) then
    raise exception 'forbidden';
  end if;

  select count(*)::int into cnt
  from public.checkins where passport_id = _passport_id;

  return query
  select
    pr.id,
    pr.prize_type,
    case
      when pr.is_active = false then false
      when pr.prize_type = 'completion_prize' then p.status = 'completed'
      when pr.prize_type in ('draw_entry','instant_reward')
        then pr.threshold_checkins is not null and cnt >= pr.threshold_checkins
      else false
    end as eligible,
    case
      when pr.prize_type = 'draw_entry' and pr.threshold_checkins is not null and pr.threshold_checkins > 0 then
        least(
          coalesce(pr.max_entries_per_passport, 2147483647),
          (cnt / pr.threshold_checkins) * pr.entries_per_threshold
        )
      else 0
    end as entry_count
  from public.prize_rules pr
  where pr.event_id = p.event_id;
end;
$$;

-- Generic event CSV export. Writes an export_logs row.
create or replace function public.export_event_csv(
  _event_id uuid,
  _kind text,
  _filters jsonb default '{}'::jsonb,
  _client_ip inet default null,
  _user_agent text default null
)
returns uuid                                    -- export_logs.id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_log uuid;
  v_rows int := 0;
begin
  if _kind not in ('visitors','checkins','passports') then
    raise exception 'invalid_kind';
  end if;

  select agency_id into v_agency from public.events where id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  -- Row counting only; actual CSV streaming is done by a future server fn
  -- that calls a paged read RPC. Logging is the security boundary.
  if _kind = 'visitors' then
    select count(*)::int into v_rows from public.visitors where event_id = _event_id;
  elsif _kind = 'checkins' then
    select count(*)::int into v_rows from public.checkins where event_id = _event_id;
  elsif _kind = 'passports' then
    select count(*)::int into v_rows from public.passports where event_id = _event_id;
  end if;

  insert into public.export_logs (
    agency_id, event_id, user_id, kind, prize_rule_id,
    row_count, filters, client_ip, user_agent
  ) values (
    v_agency, _event_id, auth.uid(), _kind, null,
    v_rows, _filters, _client_ip, _user_agent
  )
  returning id into v_log;

  return v_log;
end;
$$;

-- Prize entrants export. Writes an export_logs row.
create or replace function public.export_prize_entrants(
  _event_id uuid,
  _prize_rule_id uuid,
  _client_ip inet default null,
  _user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_log uuid;
  v_rows int;
begin
  select agency_id into v_agency from public.events where id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;
  if not exists (
    select 1 from public.prize_rules
    where id = _prize_rule_id and event_id = _event_id
  ) then
    raise exception 'prize_rule_not_in_event';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  -- Approximation: count passports meeting eligibility right now.
  select count(*)::int into v_rows
  from public.passports p
  where p.event_id = _event_id
    and (select eligible from public.evaluate_prize_eligibility(p.id)
         where prize_rule_id = _prize_rule_id) = true;

  insert into public.export_logs (
    agency_id, event_id, user_id, kind, prize_rule_id,
    row_count, filters, client_ip, user_agent
  ) values (
    v_agency, _event_id, auth.uid(), 'prize_entrants', _prize_rule_id,
    coalesce(v_rows, 0), jsonb_build_object('prize_rule_id', _prize_rule_id),
    _client_ip, _user_agent
  )
  returning id into v_log;

  return v_log;
end;
$$;

-- Invite / revoke agency members (owner only).
create or replace function public.invite_agency_member(
  _agency_id uuid,
  _user_id uuid,
  _role public.agency_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_owner(auth.uid(), _agency_id)) then
    raise exception 'forbidden';
  end if;

  insert into public.agency_members (agency_id, user_id, role, invited_by)
  values (_agency_id, _user_id, _role, auth.uid())
  on conflict (agency_id, user_id, role) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_agency_member(
  _agency_id uuid,
  _user_id uuid,
  _role public.agency_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_owner(auth.uid(), _agency_id)) then
    raise exception 'forbidden';
  end if;

  delete from public.agency_members
  where agency_id = _agency_id and user_id = _user_id and role = _role;
end;
$$;

-- Admin RPCs are NOT granted to anon. authenticated only.
grant execute on function public.rotate_venue_qr(uuid)                                        to authenticated;
grant execute on function public.evaluate_prize_eligibility(uuid)                             to authenticated;
grant execute on function public.export_event_csv(uuid, text, jsonb, inet, text)              to authenticated;
grant execute on function public.export_prize_entrants(uuid, uuid, inet, text)                to authenticated;
grant execute on function public.invite_agency_member(uuid, uuid, public.agency_role)         to authenticated;
grant execute on function public.revoke_agency_member(uuid, uuid, public.agency_role)         to authenticated;
