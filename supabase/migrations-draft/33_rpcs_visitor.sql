-- 33_rpcs_visitor.sql
-- Draft only. Do not execute.
-- Visitor RPCs. SECURITY DEFINER, explicit search_path, no SELECT *.
-- Returns only fields the passport owner is allowed to see; never returns
-- another visitor's PII.
--
-- DEFERRED SCOPE (intentional, tracked):
--   * get_passport_by_token returns only owner identity + raw checkin_count.
--     Reward progress, prize eligibility, and milestone state will be added
--     in a later migration (alongside reward_rules / prize_rules evaluation
--     helpers) BEFORE the visitor UI consumes those fields.
--   * redeem_checkin writes the checkin row only. Passport completion and
--     reward unlock evaluation (reading reward_rules, flipping
--     passports.status to 'completed', writing completed_at) will be added
--     in a later migration BEFORE UI integration. The current RPC is safe
--     in isolation: it never leaves the passport in an inconsistent state,
--     it just doesn't yet advance progress.

-- Helper: SHA-256 of a raw access token.
create or replace function public.passport_token_hash(_raw text)
returns bytea
language sql
immutable
set search_path = public
as $$
  select digest(_raw, 'sha256')
$$;

-- register_visitor
-- Creates visitor + passport + consent rows in a single transaction.
-- Returns the raw access token ONCE so the client can store it.
create or replace function public.register_visitor(
  _event_id uuid,
  _email citext,
  _full_name text,
  _first_name text,
  _last_name text,
  _mobile text,
  _postcode text,
  _marketing_opt_in boolean,
  _accepted_terms_version_id uuid,
  _locale text default null,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  passport_id uuid,
  access_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_visitor uuid;
  v_passport uuid;
  v_raw text;
  v_hash bytea;
begin
  -- Resolve agency_id; reject if event is not published.
  select agency_id into v_agency
  from public.events
  where id = _event_id and status = 'published';
  if v_agency is null then
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;

  -- Validate terms version belongs to this event.
  if _accepted_terms_version_id is null
     or not exists (
       select 1 from public.event_terms_versions
       where id = _accepted_terms_version_id and event_id = _event_id
     )
  then
    raise exception 'terms_version_invalid' using errcode = 'P0001';
  end if;

  -- Upsert visitor by (event_id, email).
  insert into public.visitors (
    agency_id, event_id, email, full_name, first_name, last_name,
    mobile, postcode, marketing_opt_in, locale
  )
  values (
    v_agency, _event_id, _email, _full_name, _first_name, _last_name,
    _mobile, _postcode, coalesce(_marketing_opt_in, false), _locale
  )
  on conflict (event_id, email) do update
    set full_name = excluded.full_name,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        mobile = coalesce(excluded.mobile, public.visitors.mobile),
        postcode = coalesce(excluded.postcode, public.visitors.postcode),
        marketing_opt_in = excluded.marketing_opt_in
  returning id into v_visitor;

  -- Generate opaque token + hash.
  v_raw := encode(gen_random_bytes(32), 'base64');
  v_raw := replace(replace(replace(v_raw, '+','-'), '/','_'), '=','');
  v_hash := digest(v_raw, 'sha256');

  insert into public.passports (
    agency_id, event_id, visitor_id, access_token_hash
  ) values (
    v_agency, _event_id, v_visitor, v_hash
  )
  on conflict (event_id, visitor_id) do update
    set access_token_hash = excluded.access_token_hash,
        updated_at = now()
  returning id into v_passport;

  -- Consent ledger (terms + privacy required; marketing optional).
  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, passport_id,
    consent_type, decision, terms_version_id,
    client_ip, user_agent
  ) values
    (v_agency, _event_id, v_visitor, v_passport, 'terms',   'granted', _accepted_terms_version_id, _client_ip, _user_agent),
    (v_agency, _event_id, v_visitor, v_passport, 'privacy', 'granted', _accepted_terms_version_id, _client_ip, _user_agent);

  if coalesce(_marketing_opt_in, false) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, terms_version_id,
      client_ip, user_agent
    ) values (v_agency, _event_id, v_visitor, v_passport, 'marketing', 'granted', null, _client_ip, _user_agent);
  end if;

  return query select v_passport, v_raw;
end;
$$;

-- update_marketing_consent (append-only)
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
  where access_token_hash = digest(_raw_token, 'sha256');

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

-- get_passport_by_token: returns ONLY the passport owner's data.
create or replace function public.get_passport_by_token(_raw_token text)
returns table (
  passport_id uuid,
  event_id uuid,
  status text,
  completed_at timestamptz,
  leaderboard_opt_out boolean,
  -- Owner-only PII fields:
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
  where p.access_token_hash = digest(_raw_token, 'sha256')
  limit 1
$$;

-- redeem_checkin: the ONLY writer of public.checkins.
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
  -- 1. Resolve QR.
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

  -- 2. Resolve passport.
  select id as passport_id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = digest(_passport_token, 'sha256');

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3. Tenant integrity: passport must belong to QR's event.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4. Load checkin settings (with safe defaults).
  select coalesce(es.one_checkin_per_venue, true)             as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0)     as min_seconds,
         coalesce(es.allow_manual_admin_checkins, false)      as allow_manual
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  -- 5. one-per-venue: short-circuit duplicate to idempotent result.
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

  -- 6. min-seconds rate limit per passport.
  if s.min_seconds > 0 then
    select max(created_at) into v_last
    from public.checkins where passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7. Insert checkin (definer-bypass of RLS).
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

grant execute on function public.register_visitor(
  uuid, citext, text, text, text, text, text, boolean, uuid, text, inet, text
) to anon, authenticated;
grant execute on function public.update_marketing_consent(text, text, inet, text) to anon, authenticated;
grant execute on function public.get_passport_by_token(text)                       to anon, authenticated;
grant execute on function public.redeem_checkin(text, text, inet, text)            to anon, authenticated;
