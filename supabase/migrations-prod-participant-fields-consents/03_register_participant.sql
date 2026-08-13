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
