-- DRAFT — do not execute until approved.
--
-- Fixes the passport-token lookup RPCs on production. Same root cause as the
-- already-applied register_visitor pgcrypto fix:
--
--   SQLSTATE 42883: function digest(text, unknown) does not exist
--
-- The functions below are SECURITY DEFINER with `set search_path = public`,
-- but they call pgcrypto's digest() without schema qualification. pgcrypto
-- lives in the `extensions` schema on this project, so the call cannot
-- resolve under the locked search_path.
--
-- Symptom in the app: PassportPage receives an RPC error from
-- public.get_passport_by_token and renders "Passport link not found or
-- replaced", even though the passport row exists with the matching
-- access_token_hash.
--
-- Scope:
--   - Replaces ONLY the three lookup RPCs and the passport_token_hash helper
--     so every passport-token comparison hashes the raw token identically.
--   - Schema-qualifies pgcrypto calls as extensions.digest(...).
--   - Preserves function names, signatures, return shapes, SECURITY DEFINER,
--     search_path, validation gates, error codes/messages, and EXECUTE grants.
--   - Does NOT touch passports / visitors / checkins / consent data.
--   - Does NOT change DNS, Cloudflare, Worker, frontend, or unrelated RPCs.
--   - Does NOT modify register_visitor (already fixed in migration 03 of the
--     visitor-registration draft folder).

begin;

-- Safety: pgcrypto must be reachable via the extensions schema before we
-- replace any function that depends on it. Fail closed if not.
do $$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception
      'pgcrypto digest(text,text) is not available in the extensions schema; inspect pg_extension.extnamespace before applying this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Helper: passport_token_hash(text) -> bytea
--    Used by some callers / tests. Make it consistent with the lookup RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.passport_token_hash(_raw text)
returns bytea
language sql
immutable
set search_path = public
as $$
  select extensions.digest(_raw, 'sha256')
$$;

-- ---------------------------------------------------------------------------
-- 2. get_passport_by_token: the call site that powers /passport/$token.
--    Owner-only PII; unchanged column list and limits.
-- ---------------------------------------------------------------------------
create or replace function public.get_passport_by_token(_raw_token text)
returns table (
  passport_id uuid,
  event_id uuid,
  status text,
  completed_at timestamptz,
  leaderboard_opt_out boolean,
  email citext,
  full_name text,
  first_name text,
  last_name text,
  mobile text,
  postcode text,
  marketing_opt_in boolean,
  checkin_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.event_id, p.status, p.completed_at, p.leaderboard_opt_out,
    v.email, v.full_name, v.first_name, v.last_name,
    v.mobile, v.postcode, v.marketing_opt_in,
    (select count(*)::int from public.checkins c where c.passport_id = p.id)
  from public.passports p
  join public.visitors v on v.id = p.visitor_id
  where p.access_token_hash = extensions.digest(_raw_token, 'sha256')
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3. update_marketing_consent: same hash comparison must work.
-- ---------------------------------------------------------------------------
create or replace function public.update_marketing_consent(
  _raw_token text,
  _decision text,
  _client_ip inet default null,
  _user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if _decision not in ('granted','withdrawn') then
    raise exception 'invalid_decision';
  end if;

  select id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = extensions.digest(_raw_token, 'sha256');

  if p.id is null then
    raise exception 'passport_not_found';
  end if;

  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, passport_id,
    consent_type, decision, terms_version_id,
    client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.visitor_id, p.id,
    'marketing', _decision, null, _client_ip, _user_agent
  );

  update public.visitors
    set marketing_opt_in = (_decision = 'granted')
  where id = p.visitor_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. redeem_checkin: passport resolution branch uses the same comparison.
--    Body is otherwise identical to the deployed version.
-- ---------------------------------------------------------------------------
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
begin
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         e.status as event_status
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

  select id as passport_id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = extensions.digest(_passport_token, 'sha256');

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  select coalesce(es.one_checkin_per_venue, true)             as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0)     as min_seconds,
         coalesce(es.allow_manual_admin_checkins, false)      as allow_manual
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

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

  if s.min_seconds > 0 then
    select max(created_at) into v_last
    from public.checkins where passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  insert into public.checkins (
    agency_id, event_id, passport_id, visitor_id,
    venue_id, venue_qr_code_id, source,
    client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.passport_id, p.visitor_id,
    q.venue_id, q.qr_id, 'qr_scan',
    _client_ip, _user_agent
  )
  returning id into v_checkin;

  return query select v_checkin, q.venue_id, p.passport_id, true;
end;
$$;

-- Restate EXECUTE grants (CREATE OR REPLACE preserves them; restating is
-- defensive against accidental DROP/CREATE later).
grant execute on function public.passport_token_hash(text)                       to anon, authenticated;
grant execute on function public.get_passport_by_token(text)                     to anon, authenticated;
grant execute on function public.update_marketing_consent(text, text, inet, text) to anon, authenticated;
grant execute on function public.redeem_checkin(text, text, inet, text)          to anon, authenticated;

commit;
