-- 02_redeem_checkin_with_entry_value.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Patches public.redeem_checkin so the QR's current entry_value is
-- snapshotted onto the new checkin row. Duplicate / rate-limit paths
-- are unchanged. Existing callers (front-end and visitor flow) need no
-- changes — the parameter list and return shape are identical.
--
-- Depends on:
--   * 01_qr_and_checkin_entry_value.sql (entry_value columns)

begin;

create or replace function public.redeem_checkin(
  _qr_token text,
  _passport_token text,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  checkin_id uuid,
  venue_id uuid,
  passport_id uuid,
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
  v_entry_value int;
begin
  -- 1. Resolve QR (+ snapshot its current entry_value).
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         qr.entry_value, e.status as event_status
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  where qr.token = _qr_token and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  -- Clamp defensively in case of any future drift; CHECK already enforces 1..100.
  v_entry_value := greatest(1, least(coalesce(q.entry_value, 1), 100));

  -- 2. Resolve passport.
  select id as passport_id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = digest(_passport_token, 'sha256');

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3. Tenant integrity.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4. Settings.
  select coalesce(es.one_checkin_per_venue, true)             as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0)     as min_seconds
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  -- 5. one-per-venue idempotency.
  if s.one_per_venue then
    select id into v_existing
    from public.checkins
    where passport_id = p.passport_id and venue_id = q.venue_id
    limit 1;

    if v_existing is not null then
      return query select v_existing, q.venue_id, p.passport_id, false;
      return;
    end if;
  end if;

  -- 6. Rate limit.
  if s.min_seconds > 0 then
    select max(created_at) into v_last
    from public.checkins where passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7. Insert checkin with snapshotted entry_value.
  insert into public.checkins (
    agency_id, event_id, passport_id, visitor_id,
    venue_id, venue_qr_code_id, source,
    entry_value, client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.passport_id, p.visitor_id,
    q.venue_id, q.qr_id, 'qr_scan',
    v_entry_value, _client_ip, _user_agent
  )
  returning id into v_checkin;

  return query select v_checkin, q.venue_id, p.passport_id, true;
end;
$$;

grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

commit;

-- Rollback: re-apply the previous body of redeem_checkin from
-- supabase/migrations-draft/33_rpcs_visitor.sql.
