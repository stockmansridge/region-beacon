-- 10_sms_consent_public.sql
-- GetStampd SMS Messaging — public (anon) SMS consent capture.
--
-- Why this exists:
--   The public join/signup form has no Supabase session, so it cannot call
--   sms_record_consent (service_role only). This adds a definer RPC that
--   resolves the passport from its raw access token — exactly like
--   update_marketing_consent does for email marketing — and records SMS
--   consent for THAT passport only.
--
-- Guarantees:
--   * SMS consent is a separate consent_type ('sms'); email marketing_opt_in
--     is never read or written here.
--   * sms_opt_in can only become true when the mobile number normalises to a
--     valid E.164 number. Otherwise the grant is refused and nothing is set.
--   * Every call appends to public.visitor_consents (append-only), including
--     the number the consent applies to, so a later number change leaves a
--     complete audit trail instead of silently transferring consent.
--   * Existing visitors are untouched — sms_opt_in stays false until someone
--     explicitly opts in through this function.
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

-- Which phone number a consent decision applied to (audit trail).
alter table public.visitor_consents
  add column if not exists channel_address text;

comment on column public.visitor_consents.channel_address is
  'For channel consents (sms): the E.164 number the decision applied to.';

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
   where access_token_hash = extensions.digest(_raw_token, 'sha256');

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

commit;
