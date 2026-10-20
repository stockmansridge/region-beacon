-- Multi-device passport persistence — ADDITIVE, idempotent. Review only;
-- apply manually in the SQL editor when approved. Safe to re-run.
--
-- Problem: lookup_passport_by_email used to ROTATE passports.access_token_hash
-- on every email login, so the original passport link and every other device
-- stopped working (perpetual re-logins).
--
-- Fix:
--   1. New table public.passport_device_tokens (hash only) holds independent
--      per-device bearer tokens that all resolve to the SAME passport.
--   2. New central resolver public.resolve_passport_id_by_token(text) accepts
--      EITHER the original passports.access_token_hash OR a device token hash.
--   3. Every token-validating RPC is redefined with ONLY its token-resolution
--      predicate changed to use the resolver. Signatures, return shapes,
--      grants, rate limits, tenant checks and business logic are unchanged.
--   4. lookup_passport_by_email now INSERTS a new device token and never
--      modifies passports.access_token_hash. Existing tokens keep working.
--
-- Nothing is dropped. No existing tokens, passports, checkins, points,
-- consents or bookmarks are modified.

begin;

-- Safety: pgcrypto must be reachable via the extensions schema. Fail closed.
do $$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception
      'pgcrypto digest(text,text) is not available in the extensions schema; inspect pg_extension.extnamespace before applying this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Device token table. Hash only; the raw token is never stored.
-- ---------------------------------------------------------------------------
create table if not exists public.passport_device_tokens (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.passports(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint passport_device_tokens_hash_unique unique (token_hash)
);

create index if not exists passport_device_tokens_passport_idx
  on public.passport_device_tokens (passport_id, created_at desc);

-- No direct client access: tokens are minted and resolved only through the
-- security-definer functions below.
grant all on public.passport_device_tokens to service_role;
revoke all on public.passport_device_tokens from anon, authenticated;

alter table public.passport_device_tokens enable row level security;

drop policy if exists deny_all on public.passport_device_tokens;
create policy deny_all on public.passport_device_tokens
  as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------------
-- 2. Central resolver: raw token -> passport id.
--    Accepts the original passport key OR any device token. STABLE: no writes.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_passport_id_by_token(_raw text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if _raw is null or length(_raw) < 8 then
    return null;
  end if;

  select p.id into v_id
  from public.passports p
  where p.access_token_hash = extensions.digest(_raw, 'sha256')
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select d.passport_id into v_id
  from public.passport_device_tokens d
  where d.token_hash = extensions.digest(_raw, 'sha256')
  limit 1;

  return v_id;
end;
$$;

grant execute on function public.resolve_passport_id_by_token(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. lookup_passport_by_email: mint a NEW device token; never rotate the
--    original passport key. Same signature, same 10/hour rate limit.
--    Device tokens per passport are capped at 10 (oldest pruned) so repeated
--    logins cannot grow unbounded aliases.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_passport_by_email(_event_id uuid, _email citext)
returns table (access_token text)
language plpgsql security definer set search_path = public
as $$
declare
  v_passport uuid;
  v_email_hash bytea;
  v_raw text;
begin
  v_email_hash := sha256(convert_to(lower(btrim(_email::text)), 'UTF8'));

  -- Simple rate limit: 10 lookups per event+email per hour (unchanged).
  if (select count(*) from public.passport_email_logins l
      where l.event_id = _event_id and l.email_hash = v_email_hash
        and l.created_at > now() - interval '1 hour') >= 10 then
    return;
  end if;

  select p.id into v_passport
  from public.visitors v
  join public.passports p on p.visitor_id = v.id and p.event_id = v.event_id
  where v.event_id = _event_id and lower(v.email::text) = lower(btrim(_email::text))
  limit 1;
  if v_passport is null then
    insert into public.passport_email_logins (event_id, email_hash) values (_event_id, v_email_hash);
    return; -- zero rows: not registered
  end if;

  -- Mint a NEW device token. The original passport key is NOT modified, so
  -- existing devices and emailed links keep working.
  v_raw := encode(extensions.gen_random_bytes(32), 'base64');
  v_raw := replace(replace(replace(v_raw, '+','-'), '/','_'), '=','');

  insert into public.passport_device_tokens (passport_id, event_id, token_hash)
  values (v_passport, _event_id, extensions.digest(v_raw, 'sha256'));

  -- Bound aliases: keep only the 10 newest device tokens per passport.
  delete from public.passport_device_tokens d
  where d.passport_id = v_passport
    and d.id not in (
      select id from public.passport_device_tokens
      where passport_id = v_passport
      order by created_at desc
      limit 10
    );

  insert into public.passport_email_logins (event_id, email_hash) values (_event_id, v_email_hash);
  return query select v_raw;
end;
$$;

revoke all on function public.lookup_passport_by_email(uuid, citext) from public;
grant execute on function public.lookup_passport_by_email(uuid, citext) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. get_passport_by_token — only the token predicate changes.
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
  where p.id = public.resolve_passport_id_by_token(_raw_token)
  limit 1
$$;

grant execute on function public.get_passport_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. update_marketing_consent — only the token predicate changes.
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
  where id = public.resolve_passport_id_by_token(_raw_token);

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

grant execute on function public.update_marketing_consent(text, text, inet, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. redeem_checkin — consolidated production version (venue_name,
--    points_awarded, already_checked_in). Only the token predicate changes.
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
  is_new boolean,
  venue_name text,
  points_awarded integer,
  already_checked_in boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
  v_entry_value int;
  v_venue_name text;
begin
  -- 1) Resolve QR + snapshot entry_value + venue name.
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         coalesce(qr.entry_value, 1) as entry_value,
         e.status as event_status,
         v.name as venue_name
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  join public.venues v on v.id = qr.venue_id
  where qr.token = _qr_token and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  v_entry_value := greatest(1, least(coalesce(q.entry_value, 1), 100));
  v_venue_name := q.venue_name;

  -- 2) Resolve passport (original key OR device token).
  select pp.id as passport_id, pp.agency_id, pp.event_id, pp.visitor_id
    into p
  from public.passports pp
  where pp.id = public.resolve_passport_id_by_token(_passport_token);

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3) Tenant integrity.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4) Settings.
  select coalesce(es.one_checkin_per_venue, true)         as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0) as min_seconds
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  -- 5) One-per-venue idempotency: short-circuit with already_checked_in=true.
  if s.one_per_venue then
    select c.id into v_existing
    from public.checkins c
    where c.passport_id = p.passport_id and c.venue_id = q.venue_id
    limit 1;

    if v_existing is not null then
      return query select
        v_existing,
        q.venue_id,
        p.passport_id,
        false,
        v_venue_name,
        0,
        true;
      return;
    end if;
  end if;

  -- 6) Rate limit.
  if s.min_seconds > 0 then
    select max(c.created_at) into v_last
    from public.checkins c where c.passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7) Insert checkin (snapshots entry_value).
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

  -- 8) Award venue points to ledger (idempotent via partial unique index).
  if v_entry_value > 0 then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      p.agency_id, p.event_id, p.passport_id,
      'venue', q.venue_id, v_entry_value,
      jsonb_build_object(
        'venue_id', q.venue_id,
        'venue_name', v_venue_name,
        'checkin_id', v_checkin,
        'qr_entry_value', v_entry_value
      )
    )
    on conflict (event_id, participant_id, award_type, source_id)
      where source_id is not null
    do nothing;
  end if;

  -- 9) Return fresh-scan summary.
  return query select
    v_checkin,
    q.venue_id,
    p.passport_id,
    true,
    v_venue_name,
    v_entry_value,
    false;
end;
$$;

grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. claim_bonus_code — only the token predicate changes.
-- ---------------------------------------------------------------------------
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
#variable_conflict use_column
declare
  b record;
  p record;
  v_source_id uuid;
  v_venue_id uuid := null;
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
  join public.events e on e.id = bc.event_id and e.agency_id = bc.agency_id
  where bc.qr_code_token = _token;

  if b.bonus_id is not null then
    v_source_id := b.bonus_id;
  else
    select bc.id as bonus_id, bc.agency_id, bc.event_id as b_event_id, bc.name,
           bc.points_value, (bc.is_active and ebv.is_active) as is_active,
           e.status as event_status, ebv.id as source_id, ebv.venue_id
      into b
    from public.event_bonus_code_venues ebv
    join public.event_bonus_codes bc
      on bc.id = ebv.bonus_code_id
     and bc.agency_id = ebv.agency_id and bc.event_id = ebv.event_id
    join public.events e on e.id = bc.event_id and e.agency_id = bc.agency_id
    where ebv.qr_code_token = _token;
    v_source_id := b.source_id;
    v_venue_id := b.venue_id;
  end if;

  if b.bonus_id is null then
    return query select
      false, false, null::uuid, null::uuid, null::text,
      0, 0, 0, 0,
      'Bonus code not found.'::text;
    return;
  end if;

  if b.is_active is not true then
    return query select
      false, false, b.b_event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This bonus code is no longer active.'::text;
    return;
  end if;

  if b.event_status is distinct from 'published' then
    return query select
      false, false, b.b_event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This event is not currently live.'::text;
    return;
  end if;

  -- 2. Resolve passport via access token (original key OR device token).
  select pp.id as passport_id, pp.agency_id, pp.event_id as p_event_id
    into p
  from public.passports pp
  where pp.id = public.resolve_passport_id_by_token(_passport_token);

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

  -- The qualified source is the parent for event tokens and child for venue tokens.
  -- variable_conflict use_column disambiguates the OUT event_id column.
  insert into public.participant_point_awards (
    agency_id, event_id, participant_id,
    award_type, source_id, points_awarded, metadata
  ) values (
    p.agency_id, p.p_event_id, p.passport_id,
    'bonus', v_source_id, coalesce(b.points_value, 0),
    jsonb_build_object('bonus_code_id', b.bonus_id, 'bonus_code_name', b.name,
                       'venue_id', v_venue_id)
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

-- ---------------------------------------------------------------------------
-- 8. claim_venue_tasting_qr — only the token predicate changes (also removes
--    the latent unqualified digest() call).
-- ---------------------------------------------------------------------------
create or replace function public.claim_venue_tasting_qr(
  _qr_token text,
  _passport_token text
)
returns table (
  success boolean,
  already_collected boolean,
  event_id uuid,
  venue_id uuid,
  tasting_qr_id uuid,
  tasting_qr_label text,
  venue_name text,
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
  q record;
  p record;
  v_inserted boolean := false;
  v_awarded int := 0;
  v_already boolean := false;
  v_total int := 0;
  v_venue_total int := 0;
  v_bonus_total int := 0;
begin
  -- 1. Resolve tasting QR + venue + event status.
  select t.id as tasting_id, t.agency_id, t.event_id, t.venue_id,
         t.label, t.points, t.status as qr_status, t.starts_at, t.ends_at,
         v.name as venue_name, v.status as venue_status, v.deleted_at as venue_deleted,
         e.status as event_status
    into q
  from public.venue_tasting_qr_codes t
  join public.venues v on v.id = t.venue_id
  join public.events e on e.id = t.event_id
  where t.qr_token = _qr_token and t.deleted_at is null;

  if q.tasting_id is null then
    return query select
      false, false, null::uuid, null::uuid, null::uuid, null::text, null::text,
      0, 0, 0, 0,
      'This tasting QR is not available.'::text;
    return;
  end if;

  if q.qr_status <> 'active' then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting code is currently disabled.'::text;
    return;
  end if;

  if q.venue_status <> 'active' or q.venue_deleted is not null then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This venue is not currently available.'::text;
    return;
  end if;

  if q.event_status <> 'published' then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This event is not currently live.'::text;
    return;
  end if;

  if q.starts_at is not null and now() < q.starts_at then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting QR is not active yet.'::text;
    return;
  end if;
  if q.ends_at is not null and now() > q.ends_at then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting QR has expired.'::text;
    return;
  end if;

  -- 2. Resolve passport via access token (original key OR device token;
  --    never trust raw passport_id).
  select id as passport_id, agency_id, event_id
    into p
  from public.passports
  where id = public.resolve_passport_id_by_token(_passport_token);

  if p.passport_id is null then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'Passport not found.'::text;
    return;
  end if;

  -- 3. Tenant integrity.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting QR is for a different event.'::text;
    return;
  end if;

  -- 4. Insert claim (unique on tasting_qr_id, passport_id).
  insert into public.venue_tasting_qr_claims (
    agency_id, event_id, venue_id, tasting_qr_id, passport_id, points_awarded
  ) values (
    p.agency_id, p.event_id, q.venue_id, q.tasting_id, p.passport_id,
    coalesce(q.points, 0)
  )
  on conflict (tasting_qr_id, passport_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- 5. Mirror to participant_point_awards (idempotent via existing unique
  -- index on event_id+participant_id+award_type+source_id).
  if v_inserted then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      p.agency_id, p.event_id, p.passport_id,
      'tasting', q.tasting_id, coalesce(q.points, 0),
      jsonb_build_object(
        'tasting_qr_id', q.tasting_id,
        'tasting_qr_label', q.label,
        'venue_id', q.venue_id,
        'venue_name', q.venue_name
      )
    )
    on conflict (event_id, participant_id, award_type, source_id)
    where source_id is not null
    do nothing;
    v_awarded := coalesce(q.points, 0);
    v_already := false;
  else
    v_awarded := 0;
    v_already := true;
  end if;

  -- 6. Totals.
  select coalesce(sum(points_awarded), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'venue'), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'bonus'), 0)::int
    into v_total, v_venue_total, v_bonus_total
  from public.participant_point_awards
  where event_id = q.event_id and participant_id = p.passport_id;

  return query select
    true,
    v_already,
    q.event_id,
    q.venue_id,
    q.tasting_id,
    q.label,
    q.venue_name,
    v_awarded,
    v_total,
    v_venue_total,
    v_bonus_total,
    case
      when v_already then 'Already collected'
      else 'Tasting points collected'
    end::text;
end;
$$;

grant execute on function public.claim_venue_tasting_qr(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. get_passport_stamps_by_token — only the token predicate changes.
-- ---------------------------------------------------------------------------
create or replace function public.get_passport_stamps_by_token(
  _raw_token text
)
returns table (
  passport_id           uuid,
  event_id              uuid,
  event_name            text,
  venue_label_singular  text,
  venue_label_plural    text,
  total_venues          int,
  stamped_count         int,
  venue_id              uuid,
  venue_name            text,
  venue_logo_path       text,
  venue_cover_path      text,
  order_index           int,
  is_stamped            boolean,
  checked_in_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  v_total int;
  v_stamped int;
  v_event_name text;
  v_label_sing text;
  v_label_plur text;
begin
  if _raw_token is null or length(_raw_token) < 8 then
    return;
  end if;

  select pp.id as passport_id, pp.event_id as event_id
    into p
  from public.passports pp
  where pp.id = public.resolve_passport_id_by_token(_raw_token)
  limit 1;

  if p.passport_id is null then
    return;
  end if;

  select e.name into v_event_name
  from public.events e
  where e.id = p.event_id and e.deleted_at is null
  limit 1;

  select
    coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue'),
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues')
    into v_label_sing, v_label_plur
  from public.event_branding b
  where b.event_id = p.event_id
  limit 1;

  if v_label_sing is null then v_label_sing := 'Venue'; end if;
  if v_label_plur is null then v_label_plur := 'Venues'; end if;

  select count(*)::int into v_total
  from public.venues v
  where v.event_id = p.event_id
    and v.status = 'active'
    and v.deleted_at is null;

  select count(distinct c.venue_id)::int into v_stamped
  from public.checkins c
  join public.venues v
    on v.id = c.venue_id
   and v.event_id = p.event_id
   and v.status = 'active'
   and v.deleted_at is null
  where c.passport_id = p.passport_id;

  return query
    with first_checkin as (
      select c.venue_id, min(c.created_at) as first_at
      from public.checkins c
      where c.passport_id = p.passport_id
      group by c.venue_id
    )
    select
      p.passport_id                       as passport_id,
      p.event_id                          as event_id,
      v_event_name                        as event_name,
      v_label_sing                        as venue_label_singular,
      v_label_plur                        as venue_label_plural,
      v_total                             as total_venues,
      v_stamped                           as stamped_count,
      v.id                                as venue_id,
      v.name                              as venue_name,
      v.logo_path                         as venue_logo_path,
      v.cover_path                        as venue_cover_path,
      v.order_index                       as order_index,
      (fc.first_at is not null)           as is_stamped,
      fc.first_at                         as checked_in_at
    from public.venues v
    left join first_checkin fc on fc.venue_id = v.id
    where v.event_id = p.event_id
      and v.status = 'active'
      and v.deleted_at is null
    order by
      (fc.first_at is null),       -- stamped first
      fc.first_at asc nulls last,  -- earliest stamp first
      v.order_index nulls last,
      v.name;
end;
$$;

grant execute on function public.get_passport_stamps_by_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. get_passport_rewards_by_token — only the token predicate changes.
-- ---------------------------------------------------------------------------
create or replace function public.get_passport_rewards_by_token(_raw_token text)
returns table (
  passport_id           uuid,
  event_id              uuid,
  stamps                int,
  points                int,
  total_venues          int,
  tier                  text,
  is_completed          boolean,
  venue_label_singular  text,
  venue_label_plural    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_passport_id uuid;
  v_event_id    uuid;
  v_stamps      int;
  v_points      int;
  v_total       int;
  v_tier        text;
  v_completed   boolean;
  v_has_custom_tiers boolean;
  v_label_sing  text;
  v_label_plur  text;
begin
  if _raw_token is null or length(btrim(_raw_token)) = 0 then
    return;
  end if;

  -- Resolve passport by hashed token (original key OR device token).
  select p.id, p.event_id
    into v_passport_id, v_event_id
  from public.passports p
  where p.id = public.resolve_passport_id_by_token(_raw_token)
  limit 1;

  if v_passport_id is null then
    return;
  end if;

  -- Aggregate this passport's stamps and points.
  select
    coalesce(count(distinct c.venue_id), 0)::int,
    coalesce(sum(c.entry_value), 0)::int
    into v_stamps, v_points
  from public.checkins c
  where c.passport_id = v_passport_id;

  -- Total active venues for the event.
  select count(*)::int into v_total
  from public.venues v
  where v.event_id = v_event_id
    and v.status = 'active'
    and v.deleted_at is null;

  -- Tier resolution mirrors get_public_leaderboard_by_domain.
  select exists (
    select 1 from public.reward_rules
    where event_id = v_event_id
      and is_active = true
      and rule_type = 'min_checkins'
      and threshold is not null
  ) into v_has_custom_tiers;

  if v_has_custom_tiers then
    select rr.reward_label
      into v_tier
    from public.reward_rules rr
    where rr.event_id = v_event_id
      and rr.is_active = true
      and rr.rule_type = 'min_checkins'
      and rr.threshold is not null
      and v_stamps >= rr.threshold
    order by rr.threshold desc
    limit 1;
  else
    v_tier := case
      when v_total > 0 and v_stamps >= v_total          then 'Complete'
      when v_stamps >= least(8, greatest(v_total, 1))   then 'Gold'
      when v_stamps >= 5                                then 'Silver'
      when v_stamps >= 3                                then 'Bronze'
      else null
    end;
  end if;

  v_completed := (v_total > 0 and v_stamps >= v_total);

  -- Venue labels with fallbacks identical to other public RPCs.
  select
    coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue'),
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues')
    into v_label_sing, v_label_plur
  from public.event_branding b
  where b.event_id = v_event_id
  limit 1;

  if v_label_sing is null then v_label_sing := 'Venue'; end if;
  if v_label_plur is null then v_label_plur := 'Venues'; end if;

  return query select
    v_passport_id,
    v_event_id,
    v_stamps,
    v_points,
    v_total,
    v_tier,
    v_completed,
    v_label_sing,
    v_label_plur;
end;
$$;

grant execute on function public.get_passport_rewards_by_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. get_public_passport_progress — event scope preserved; only the token
--     predicate changes (also removes the latent unqualified digest() call).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_passport_progress(
  p_event_id uuid,
  p_passport_token text
)
returns table (
  passport_id uuid,
  total_points integer,
  venue_points integer,
  bonus_points integer,
  passport_stamp_count integer,
  total_venues integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_passport_id uuid;
  v_agency_id uuid;
  v_event_id uuid;
  v_event_status text;
  v_total int := 0;
  v_venue int := 0;
  v_bonus int := 0;
  v_stamp_count int := 0;
  v_total_venues int := 0;
begin
  -- Resolve passport by hashed access token + event scope.
  select p.id, p.agency_id, p.event_id, e.status
    into v_passport_id, v_agency_id, v_event_id, v_event_status
  from public.passports p
  join public.events e on e.id = p.event_id
  where p.event_id = p_event_id
    and p.id = public.resolve_passport_id_by_token(p_passport_token)
  limit 1;

  if v_passport_id is null then
    return;
  end if;

  -- Only expose data for published events. (Drafts/archived events stay dark.)
  if v_event_status <> 'published' then
    return;
  end if;

  -- Point totals (always return 0s if no awards yet).
  select
    coalesce(sum(ppa.points_awarded), 0)::int,
    coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'venue'), 0)::int,
    coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'bonus'), 0)::int
    into v_total, v_venue, v_bonus
  from public.participant_point_awards ppa
  where ppa.event_id = v_event_id
    and ppa.participant_id = v_passport_id;

  -- Stamp count = distinct venues this passport has checked in to.
  select count(distinct c.venue_id)::int
    into v_stamp_count
  from public.checkins c
  where c.passport_id = v_passport_id;

  -- Active venue universe for this event (matches get_public_event_venues).
  select count(*)::int
    into v_total_venues
  from public.venues v
  where v.event_id = v_event_id
    and v.status = 'active'
    and v.deleted_at is null;

  return query select
    v_passport_id,
    coalesce(v_total, 0),
    coalesce(v_venue, 0),
    coalesce(v_bonus, 0),
    coalesce(v_stamp_count, 0),
    coalesce(v_total_venues, 0);
end;
$$;

revoke all on function public.get_public_passport_progress(uuid, text) from public;
grant execute on function public.get_public_passport_progress(uuid, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. toggle_passport_bookmark / get_passport_bookmarks — only the token
--     predicate changes.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_passport_bookmark(
  _raw_token text,
  _kind text,
  _venue_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  existing uuid;
begin
  if _kind not in ('venue', 'offer') then
    raise exception 'invalid_kind';
  end if;

  select id, event_id into p
  from public.passports
  where id = public.resolve_passport_id_by_token(_raw_token)
  limit 1;

  if p.id is null then
    raise exception 'passport_not_found';
  end if;

  if not exists (
    select 1 from public.venues v
    where v.id = _venue_id and v.event_id = p.event_id
  ) then
    raise exception 'venue_not_found';
  end if;

  select b.id into existing
  from public.passport_bookmarks b
  where b.passport_id = p.id and b.kind = _kind and b.venue_id = _venue_id
  limit 1;

  if existing is not null then
    delete from public.passport_bookmarks where id = existing;
    return false;
  end if;

  insert into public.passport_bookmarks (passport_id, event_id, kind, venue_id)
  values (p.id, p.event_id, _kind, _venue_id)
  on conflict (passport_id, kind, venue_id) do nothing;

  return true;
end;
$$;

create or replace function public.get_passport_bookmarks(_raw_token text)
returns table (
  kind text,
  venue_id uuid,
  venue_name text,
  logo_path text,
  cover_path text,
  offer_summary text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.kind,
    b.venue_id,
    v.name,
    v.logo_path,
    v.cover_path,
    v.offer_summary,
    b.created_at
  from public.passport_bookmarks b
  join public.passports p on p.id = b.passport_id
  join public.venues v on v.id = b.venue_id
  where p.id = public.resolve_passport_id_by_token(_raw_token)
  order by b.created_at desc
$$;

revoke all on function public.toggle_passport_bookmark(text, text, uuid) from public;
revoke all on function public.get_passport_bookmarks(text) from public;
grant execute on function public.toggle_passport_bookmark(text, text, uuid) to anon, authenticated;
grant execute on function public.get_passport_bookmarks(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. update_sms_consent — only the token predicate changes.
-- ---------------------------------------------------------------------------
create or replace function public.update_sms_consent(
  _raw_token text,
  _decision text,
  _mobile text default null,
  _source text default 'public_join',
  _client_ip inet default null,
  _user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v record;
  canonical text;
  granted boolean;
begin
  if _decision not in ('granted', 'withdrawn') then
    raise exception 'invalid_decision';
  end if;

  select id, agency_id, event_id, visitor_id
    into p
    from public.passports
   where id = public.resolve_passport_id_by_token(_raw_token);

  if p.id is null then
    raise exception 'passport_not_found';
  end if;

  select mobile, mobile_e164, sms_opt_in
    into v
    from public.visitors
   where id = p.visitor_id;

  granted := (_decision = 'granted');

  -- Prefer the number supplied with this decision, else what we already hold.
  canonical := public.sms_normalise_au_mobile(
    coalesce(nullif(btrim(coalesce(_mobile, '')), ''), v.mobile_e164, v.mobile)
  );

  -- No usable number => consent cannot be active. Nothing is granted, and the
  -- refusal is recorded so the attempt is auditable.
  if granted and canonical is null then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, channel_address, client_ip, user_agent
    ) values (
      p.agency_id, p.event_id, p.visitor_id, p.id,
      'sms', 'withdrawn', null, _client_ip, _user_agent
    );

    update public.visitors
       set sms_opt_in = false
      where id = p.visitor_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_mobile',
      'sms_opt_in', false
    );
  end if;

  -- Number changed while consent was active: withdraw the old number first so
  -- consent is never silently carried across to a different device.
  if granted
     and v.mobile_e164 is not null
     and canonical is not null
     and v.mobile_e164 <> canonical
     and coalesce(v.sms_opt_in, false) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, channel_address, client_ip, user_agent
    ) values (
      p.agency_id, p.event_id, p.visitor_id, p.id,
      'sms', 'withdrawn', v.mobile_e164, _client_ip, _user_agent
    );
  end if;

  update public.visitors
     set mobile = case
                    when nullif(btrim(coalesce(_mobile, '')), '') is not null then btrim(_mobile)
                    else mobile
                  end,
         mobile_e164 = coalesce(canonical, mobile_e164),
         sms_opt_in = granted,
         sms_opt_in_at = case when granted then now() else sms_opt_in_at end,
         sms_opt_in_source = case
                               when granted then coalesce(nullif(btrim(coalesce(_source, '')), ''), 'public_join')
                               else sms_opt_in_source
                             end,
         sms_opt_out_at = case when granted then null else coalesce(sms_opt_out_at, now()) end,
         sms_opt_out_reason = case when granted then null else 'Withdrawn by participant' end
   where id = p.visitor_id;

  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, passport_id,
    consent_type, decision, channel_address, client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.visitor_id, p.id,
    'sms', _decision, canonical, _client_ip, _user_agent
  );

  return jsonb_build_object(
    'ok', true,
    'sms_opt_in', granted,
    'mobile_e164', canonical
  );
end;
$$;

revoke all on function public.update_sms_consent(text, text, text, text, inet, text) from public;
grant execute on function public.update_sms_consent(text, text, text, text, inet, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 14. get_public_event_bonus_challenges — event scope preserved; only the
--     token predicate changes.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_event_bonus_challenges(
  _hostname text,
  _passport_token text default null,
  _venue_id uuid default null
)
returns table (
  bonus_code_id uuid,
  name text,
  description text,
  points_value integer,
  is_claimed boolean,
  kind text,
  social_location text,
  social_hashtags text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_passport_id uuid := null;
begin
  select rh.kind, rh.event_id into r
  from public.resolve_event_by_host(_hostname) rh;

  if r.kind <> 'event' then
    return;
  end if;

  if _passport_token is not null and length(_passport_token) > 0 then
    select pp.id
      into v_passport_id
    from public.passports pp
    where pp.event_id = r.event_id
      and pp.id = public.resolve_passport_id_by_token(_passport_token)
    limit 1;
  end if;

  return query
    select
      bc.id,
      bc.name,
      bc.description,
      bc.points_value,
      case
        when v_passport_id is null then false
        else exists (
          select 1
          from public.participant_point_awards ppa
          where ppa.award_type = 'bonus'
            and ppa.source_id = bc.id
            and ppa.participant_id = v_passport_id
        )
      end as is_claimed,
      coalesce(bc.kind, 'points') as kind,
      bc.social_location,
      bc.social_hashtags
    from public.event_bonus_codes bc
    join public.events e on e.id = bc.event_id
    where bc.event_id = r.event_id
      and bc.is_active = true
      and coalesce(bc.scope, 'event') = 'event'
      and e.status = 'published'
    order by bc.created_at asc;

  if _venue_id is not null then
    return query
      select
        bc.id,
        bc.name,
        bc.description,
        bc.points_value,
        case
          when v_passport_id is null then false
          else exists (
            select 1
            from public.participant_point_awards ppa
            where ppa.award_type = 'bonus'
              and ppa.source_id = ebv.id
              and ppa.participant_id = v_passport_id
          )
        end as is_claimed,
        coalesce(bc.kind, 'points') as kind,
        bc.social_location,
        bc.social_hashtags
      from public.event_bonus_code_venues ebv
      join public.event_bonus_codes bc on bc.id = ebv.bonus_code_id
      join public.events e on e.id = bc.event_id
      where bc.event_id = r.event_id
        and bc.scope = 'per_venue'
        and bc.is_active = true
        and ebv.is_active = true
        and ebv.venue_id = _venue_id
        and e.status = 'published'
      order by bc.created_at asc;
  end if;
end;
$$;

revoke all on function public.get_public_event_bonus_challenges(text, text, uuid) from public;
grant execute on function public.get_public_event_bonus_challenges(text, text, uuid) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
