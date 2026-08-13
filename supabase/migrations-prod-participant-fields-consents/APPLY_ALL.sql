-- GetStampd: participant field settings + consent state (apply in Supabase SQL editor)
begin;

-- ===== 01_event_participant_field_settings.sql =====
-- 01_event_participant_field_settings.sql
-- GetStampd — event-level participant field settings (Name / Phone / Postcode).
--
-- What this does
--   * adds public.events.require_name and public.events.require_mobile
--   * extends public.get_event_registration_settings(_hostname) so the public
--     join page can read all three settings in one call
--
-- Defaults match what production does TODAY:
--   require_name    = true   (join form has always required a full name)
--   require_mobile  = false  (mobile has always been optional)
--   require_postcode        (already exists, default false — untouched)
--
-- Email is deliberately NOT configurable: it is the canonical participant
-- identity (visitors.email is unique per event) and stays mandatory.
--
-- Additive, idempotent, backward compatible. Apply in the Supabase SQL editor.

begin;

alter table public.events
  add column if not exists require_name boolean not null default true,
  add column if not exists require_mobile boolean not null default false;

comment on column public.events.require_name is
  'When true, the public join form requires a participant name.';
comment on column public.events.require_mobile is
  'When true, the public join form requires a phone number.';

-- Public read of the registration-form settings for the event that owns this
-- hostname. Return type gains columns, so drop first.
drop function if exists public.get_event_registration_settings(text);

create or replace function public.get_event_registration_settings(_hostname text)
returns table (
  event_id uuid,
  require_name boolean,
  require_mobile boolean,
  require_postcode boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id                                  as event_id,
    coalesce(e.require_name, true)        as require_name,
    coalesce(e.require_mobile, false)     as require_mobile,
    coalesce(e.require_postcode, false)   as require_postcode
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  where e.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_event_registration_settings(text) from public;
grant execute on function public.get_event_registration_settings(text)
  to anon, authenticated, service_role;

commit;

-- Verification
--   select * from public.get_event_registration_settings('<subdomain>.getstampd.com.au');

-- ===== 02_participant_consent_state.sql =====
-- 02_participant_consent_state.sql
-- GetStampd — ONE canonical calculation of current participant consent state.
--
-- Both the Participants tab and the participant CSV export read from this, so
-- they can never disagree.
--
-- Rules (deliberate):
--   * terms      -> 'accepted' when an auditable 'granted' terms row exists,
--                   otherwise 'not_recorded'. Never 'no'.
--   * sms        -> latest ledger decision for consent_type='sms'
--                   ('opted_in' / 'opted_out'), else fall back to the stored
--                   visitors.sms_opt_in flag when it is true ('opted_in'),
--                   else 'not_recorded'.
--   * marketing  -> latest ledger decision for consent_type='marketing',
--                   else visitors.marketing_opt_in = true -> 'opted_in',
--                   else 'not_recorded'.
--   * Nothing is inferred from the mere presence of an email or phone number.
--   * SMS and marketing are never merged; they are separate consent types.
--   * Missing history is 'not_recorded', never 'opted_out'.
--
-- Internal helper: no anon/authenticated grants. Callers are the gated admin
-- RPCs, which are SECURITY DEFINER themselves.
--
-- Additive, idempotent. Apply in the Supabase SQL editor.

begin;

-- Efficient "latest decision per visitor per consent type" lookups.
create index if not exists idx_visitor_consents_event_visitor_type
  on public.visitor_consents (event_id, visitor_id, consent_type, decided_at desc);

drop function if exists public.participant_consent_state(uuid);

create or replace function public.participant_consent_state(_event_id uuid)
returns table (
  visitor_id                   uuid,
  terms_status                 text,
  terms_accepted_at            timestamptz,
  sms_status                   text,
  sms_consent_updated_at       timestamptz,
  marketing_status             text,
  marketing_consent_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (vc.visitor_id, vc.consent_type)
      vc.visitor_id,
      vc.consent_type,
      vc.decision,
      vc.decided_at
    from public.visitor_consents vc
    where vc.event_id = _event_id
      and vc.consent_type in ('terms', 'sms', 'marketing')
    order by vc.visitor_id, vc.consent_type, vc.decided_at desc, vc.id desc
  )
  select
    v.id as visitor_id,
    case when t.decision = 'granted' then 'accepted' else 'not_recorded' end as terms_status,
    case when t.decision = 'granted' then t.decided_at end as terms_accepted_at,
    case
      when s.decision = 'granted' then 'opted_in'
      when s.decision is not null then 'opted_out'
      when coalesce(v.sms_opt_in, false) then 'opted_in'
      else 'not_recorded'
    end as sms_status,
    s.decided_at as sms_consent_updated_at,
    case
      when m.decision = 'granted' then 'opted_in'
      when m.decision is not null then 'opted_out'
      when coalesce(v.marketing_opt_in, false) then 'opted_in'
      else 'not_recorded'
    end as marketing_status,
    m.decided_at as marketing_consent_updated_at
  from public.visitors v
  left join latest t on t.visitor_id = v.id and t.consent_type = 'terms'
  left join latest s on s.visitor_id = v.id and s.consent_type = 'sms'
  left join latest m on m.visitor_id = v.id and m.consent_type = 'marketing'
  where v.event_id = _event_id;
$$;

revoke all on function public.participant_consent_state(uuid) from public;
grant execute on function public.participant_consent_state(uuid) to service_role;

commit;

-- Verification
--   select * from public.participant_consent_state('<event_id>'::uuid) limit 20;

-- ===== 03_register_participant.sql =====
-- 03_register_participant.sql
-- GetStampd — single transactional public signup RPC.
--
-- Why this exists
--   The old flow called register_visitor() and THEN update_sms_consent() from
--   the browser, so a signup could succeed while consent recording silently
--   failed. This function does everything in one transaction:
--     1. resolve/create the visitor + passport
--     2. save participant fields (name / email / mobile / postcode)
--     3. record Terms acceptance (pinned to the current terms version)
--     4. record the SMS choice (granted OR explicit withdrawn)
--     5. record the Marketing choice (granted OR explicit withdrawn)
--     6. return the completed participant result
--
-- Guarantees
--   * Server-side enforcement of the event's Name / Phone / Postcode
--     required-or-optional settings. A direct RPC call cannot bypass them.
--   * Email is always required.
--   * Terms must be accepted; signup is rejected otherwise.
--   * SMS consent is NEVER inferred from a supplied phone number — it is only
--     granted when _sms_opt_in is true AND the number normalises to E.164.
--   * SMS and Marketing are separate consent types and never merged.
--   * Consent writes are idempotent: a retry that repeats the same decision
--     does not append a duplicate ledger row.
--   * register_visitor() and update_sms_consent() are left in place; the
--     latter remains the canonical way to change SMS preference later.
--
-- Additive, idempotent, backward compatible. Apply in the Supabase SQL editor.

begin;

create or replace function public.register_participant(
  _event_id uuid,
  _email citext,
  _full_name text default null,
  _mobile text default null,
  _postcode text default null,
  _accept_terms boolean default false,
  _accepted_terms_version_id uuid default null,
  _sms_opt_in boolean default false,
  _marketing_opt_in boolean default false,
  _locale text default null,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  passport_id     uuid,
  access_token    text,
  sms_opt_in      boolean,
  marketing_opt_in boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency        uuid;
  v_current_terms uuid;
  v_req_name      boolean;
  v_req_mobile    boolean;
  v_req_postcode  boolean;
  v_name          text;
  v_first         text;
  v_last          text;
  v_email         text;
  v_mobile        text;
  v_mobile_e164   text;
  v_postcode      text;
  v_sms_granted   boolean;
  v_mkt_granted   boolean;
  v_visitor       uuid;
  v_passport      uuid;
  v_raw           text;
  v_hash          bytea;
  v_last_decision text;
begin
  -- 1. Event must exist, be publishable, and have terms configured.
  select e.agency_id,
         e.current_terms_version_id,
         coalesce(e.require_name, true),
         coalesce(e.require_mobile, false),
         coalesce(e.require_postcode, false)
    into v_agency, v_current_terms, v_req_name, v_req_mobile, v_req_postcode
  from public.events e
  where e.id = _event_id
    and e.deleted_at is null;

  if v_agency is null then
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;
  if not public.event_is_publishable(_event_id) then
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;
  if v_current_terms is null then
    raise exception 'terms_not_configured' using errcode = 'P0001';
  end if;

  -- 2. Terms acceptance is mandatory and must pin the CURRENT version.
  if not coalesce(_accept_terms, false) then
    raise exception 'terms_not_accepted' using errcode = 'P0001';
  end if;
  if _accepted_terms_version_id is null
     or _accepted_terms_version_id <> v_current_terms then
    raise exception 'terms_version_invalid' using errcode = 'P0001';
  end if;

  -- 3. Participant fields, validated against this event's settings.
  v_email := lower(btrim(coalesce(_email::text, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;

  v_name := nullif(btrim(coalesce(_full_name, '')), '');
  if v_req_name and v_name is null then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  v_mobile := nullif(btrim(coalesce(_mobile, '')), '');
  if v_req_mobile and v_mobile is null then
    raise exception 'mobile_required' using errcode = 'P0001';
  end if;
  if v_mobile is not null then
    v_mobile_e164 := public.sms_normalise_au_mobile(v_mobile);
    if v_mobile_e164 is null then
      raise exception 'mobile_invalid' using errcode = 'P0001';
    end if;
  end if;

  v_postcode := nullif(btrim(coalesce(_postcode, '')), '');
  if v_req_postcode and v_postcode is null then
    raise exception 'postcode_required' using errcode = 'P0001';
  end if;
  if v_postcode is not null and length(v_postcode) not between 3 and 12 then
    raise exception 'postcode_invalid' using errcode = 'P0001';
  end if;

  -- SMS consent requires an SMS-capable number. Never silently downgrade.
  v_sms_granted := coalesce(_sms_opt_in, false);
  if v_sms_granted and v_mobile_e164 is null then
    raise exception 'sms_requires_mobile' using errcode = 'P0001';
  end if;
  v_mkt_granted := coalesce(_marketing_opt_in, false);

  v_first := split_part(coalesce(v_name, ''), ' ', 1);
  v_last  := btrim(substring(coalesce(v_name, '') from length(v_first) + 1));

  -- 4. Visitor upsert on (event_id, email) — canonical participant record.
  insert into public.visitors (
    agency_id, event_id, email, full_name, first_name, last_name,
    mobile, mobile_e164, postcode, marketing_opt_in, locale
  )
  values (
    v_agency, _event_id, v_email, coalesce(v_name, ''),
    nullif(v_first, ''), nullif(v_last, ''),
    v_mobile, v_mobile_e164, v_postcode, v_mkt_granted, _locale
  )
  on conflict (event_id, email) do update
    set full_name        = coalesce(nullif(btrim(excluded.full_name), ''), public.visitors.full_name),
        first_name       = coalesce(excluded.first_name, public.visitors.first_name),
        last_name        = coalesce(excluded.last_name, public.visitors.last_name),
        mobile           = coalesce(excluded.mobile, public.visitors.mobile),
        mobile_e164      = coalesce(excluded.mobile_e164, public.visitors.mobile_e164),
        postcode         = coalesce(excluded.postcode, public.visitors.postcode),
        marketing_opt_in = excluded.marketing_opt_in,
        locale           = coalesce(excluded.locale, public.visitors.locale)
  returning id into v_visitor;

  -- 5. Passport upsert. Raw token returned once; only its hash is stored.
  v_raw  := encode(gen_random_bytes(32), 'base64');
  v_raw  := replace(replace(replace(v_raw, '+', '-'), '/', '_'), '=', '');
  v_hash := extensions.digest(v_raw, 'sha256');

  insert into public.passports (agency_id, event_id, visitor_id, access_token_hash)
  values (v_agency, _event_id, v_visitor, v_hash)
  on conflict (event_id, visitor_id) do update
    set access_token_hash = excluded.access_token_hash,
        updated_at = now()
  returning id into v_passport;

  -- 6. Terms + privacy consent, pinned to the accepted version. Idempotent:
  --    skip when this exact acceptance already exists.
  if not exists (
    select 1 from public.visitor_consents vc
     where vc.visitor_id = v_visitor
       and vc.consent_type = 'terms'
       and vc.decision = 'granted'
       and vc.terms_version_id = _accepted_terms_version_id
  ) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, terms_version_id, client_ip, user_agent
    ) values
      (v_agency, _event_id, v_visitor, v_passport, 'terms',   'granted', _accepted_terms_version_id, _client_ip, _user_agent),
      (v_agency, _event_id, v_visitor, v_passport, 'privacy', 'granted', _accepted_terms_version_id, _client_ip, _user_agent);
  end if;

  -- 7. SMS choice. Both opt-in AND explicit opt-out are recorded, so the
  --    admin can tell "said no" apart from "never asked".
  select vc.decision into v_last_decision
  from public.visitor_consents vc
  where vc.visitor_id = v_visitor and vc.consent_type = 'sms'
  order by vc.decided_at desc, vc.id desc
  limit 1;

  if v_last_decision is distinct from (case when v_sms_granted then 'granted' else 'withdrawn' end) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, channel_address, client_ip, user_agent
    ) values (
      v_agency, _event_id, v_visitor, v_passport, 'sms',
      case when v_sms_granted then 'granted' else 'withdrawn' end,
      v_mobile_e164, _client_ip, _user_agent
    );
  end if;

  update public.visitors
     set sms_opt_in         = v_sms_granted,
         sms_opt_in_at      = case when v_sms_granted then now() else sms_opt_in_at end,
         sms_opt_in_source  = case when v_sms_granted then 'public_join' else sms_opt_in_source end,
         sms_opt_out_at     = case when v_sms_granted then null else coalesce(sms_opt_out_at, now()) end,
         sms_opt_out_reason = case when v_sms_granted then null else 'Not opted in at signup' end
   where id = v_visitor;

  -- 8. Marketing choice — separate consent type, keyed to the email address.
  v_last_decision := null;
  select vc.decision into v_last_decision
  from public.visitor_consents vc
  where vc.visitor_id = v_visitor and vc.consent_type = 'marketing'
  order by vc.decided_at desc, vc.id desc
  limit 1;

  if v_last_decision is distinct from (case when v_mkt_granted then 'granted' else 'withdrawn' end) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, channel_address, client_ip, user_agent
    ) values (
      v_agency, _event_id, v_visitor, v_passport, 'marketing',
      case when v_mkt_granted then 'granted' else 'withdrawn' end,
      v_email, _client_ip, _user_agent
    );
  end if;

  return query select v_passport, v_raw, v_sms_granted, v_mkt_granted;
end;
$$;

revoke all on function public.register_participant(
  uuid, citext, text, text, text, boolean, uuid, boolean, boolean, text, inet, text
) from public;
grant execute on function public.register_participant(
  uuid, citext, text, text, text, boolean, uuid, boolean, boolean, text, inet, text
) to anon, authenticated, service_role;

commit;

-- Verification
--   select * from public.register_participant(
--     '<event_id>'::uuid, 'test@example.com'::citext, 'Test Person',
--     '0400000000', '2000', true, '<current_terms_version_id>'::uuid, true, false);

-- ===== 04_admin_event_participants_consents.sql =====
-- 04_admin_event_participants_consents.sql
-- GetStampd — Participants tab + participant export: one row per participant,
-- with postcode and the three consent statuses returned in the SAME query.
--
-- Extends public.get_admin_event_participants_with_points(uuid) with:
--   postcode, terms_status, terms_accepted_at,
--   sms_status, sms_consent_updated_at,
--   marketing_status, marketing_consent_updated_at
--
-- Consent values come from public.participant_consent_state() (file 02), which
-- is the single canonical calculation shared by the table and the CSV export.
-- That helper aggregates to one row per visitor, so no consent join can ever
-- duplicate a participant row.
--
-- display_name now falls back to the email address, then
-- 'Unnamed participant' — no name is ever invented.
--
-- Return type changes, so the function is dropped and recreated. Additive to
-- the caller: all previously returned columns keep their names and types.
--
-- Apply in the Supabase SQL editor AFTER 02.

begin;

drop function if exists public.get_admin_event_participants_with_points(uuid);

create or replace function public.get_admin_event_participants_with_points(
  p_event_id uuid
)
returns table (
  passport_id                  uuid,
  visitor_id                   uuid,
  display_name                 text,
  email                        text,
  mobile                       text,
  postcode                     text,
  passport_stamp_count         integer,
  total_points                 integer,
  venue_points                 integer,
  bonus_points                 integer,
  bonus_codes_claimed          integer,
  latest_activity_at           timestamptz,
  created_at                   timestamptz,
  passport_status              text,
  terms_status                 text,
  terms_accepted_at            timestamptz,
  sms_status                   text,
  sms_consent_updated_at       timestamptz,
  marketing_status             text,
  marketing_consent_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
begin
  select e.agency_id into v_agency_id
  from public.events e
  where e.id = p_event_id;

  if v_agency_id is null then
    raise exception 'event_not_found';
  end if;

  if not (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), v_agency_id)
  ) then
    raise exception 'forbidden';
  end if;

  return query
  with stamp_counts as (
    select
      c.passport_id,
      count(distinct c.venue_id)::integer as passport_stamp_count,
      max(c.created_at)                   as latest_checkin_at
    from public.checkins c
    where c.event_id = p_event_id
    group by c.passport_id
  ),
  point_counts as (
    select
      ppa.participant_id as passport_id,
      coalesce(sum(ppa.points_awarded), 0)::integer as total_points,
      coalesce(sum(ppa.points_awarded)
        filter (where ppa.award_type = 'venue'), 0)::integer as venue_points,
      coalesce(sum(ppa.points_awarded)
        filter (where ppa.award_type = 'bonus'), 0)::integer as bonus_points,
      count(distinct ppa.source_id)
        filter (where ppa.award_type = 'bonus')::integer as bonus_codes_claimed,
      max(ppa.awarded_at) as latest_award_at
    from public.participant_point_awards ppa
    where ppa.event_id = p_event_id
    group by ppa.participant_id
  ),
  consents as (
    select * from public.participant_consent_state(p_event_id)
  )
  select
    p.id            as passport_id,
    p.visitor_id    as visitor_id,
    coalesce(
      nullif(trim(v.full_name), ''),
      nullif(trim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')), ''),
      nullif(v.email::text, ''),
      'Unnamed participant'
    ) as display_name,
    v.email::text   as email,
    v.mobile        as mobile,
    v.postcode      as postcode,
    coalesce(sc.passport_stamp_count, 0)::integer as passport_stamp_count,
    coalesce(pc.total_points, 0)::integer         as total_points,
    coalesce(pc.venue_points, 0)::integer         as venue_points,
    coalesce(pc.bonus_points, 0)::integer         as bonus_points,
    coalesce(pc.bonus_codes_claimed, 0)::integer  as bonus_codes_claimed,
    nullif(
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ) as latest_activity_at,
    p.created_at    as created_at,
    p.status        as passport_status,
    coalesce(cs.terms_status, 'not_recorded')     as terms_status,
    cs.terms_accepted_at                          as terms_accepted_at,
    coalesce(cs.sms_status, 'not_recorded')       as sms_status,
    cs.sms_consent_updated_at                     as sms_consent_updated_at,
    coalesce(cs.marketing_status, 'not_recorded') as marketing_status,
    cs.marketing_consent_updated_at               as marketing_consent_updated_at
  from public.passports p
  join public.visitors v
    on v.id = p.visitor_id
  left join stamp_counts sc on sc.passport_id = p.id
  left join point_counts pc on pc.passport_id = p.id
  left join consents cs on cs.visitor_id = v.id
  where p.event_id = p_event_id
    and v.deleted_at is null
  order by
    coalesce(pc.total_points, 0) desc,
    coalesce(sc.passport_stamp_count, 0) desc,
    coalesce(
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ),
      'infinity'::timestamptz
    ) asc,
    lower(coalesce(v.full_name, '')) asc;
end;
$$;

revoke all on function public.get_admin_event_participants_with_points(uuid) from public;
grant execute on function public.get_admin_event_participants_with_points(uuid) to authenticated;

commit;

-- Verification
--   select display_name, email, postcode, terms_status, sms_status, marketing_status
--     from public.get_admin_event_participants_with_points('<event_id>'::uuid);

commit;
