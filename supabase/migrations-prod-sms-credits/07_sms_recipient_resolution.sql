-- 07_sms_recipient_resolution.sql
-- GetStampd SMS Messaging — audience resolution and STOP/opt-out handling.
--
-- Audience queries use the ACTUAL data model: public.visitors (consent +
-- canonical mobile), public.passports (one per visitor per event) and
-- public.checkins (one row per passport/venue).
--
-- Eligibility is enforced in one place so a campaign can never include a
-- visitor with no number, an unparseable number, no SMS consent, or an
-- opt-out on record.
--
-- Idempotent (create or replace). Safe to re-run. Apply in the SQL editor.

begin;

create or replace function public.sms_resolve_audience(
  _agency_id uuid,
  _event_id uuid,
  _audience_kind text,
  _audience_params jsonb default '{}'::jsonb
)
returns table (
  visitor_id uuid,
  passport_id uuid,
  phone_e164 text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  venue uuid;
begin
  -- Callable by org members (for the live composer estimate) and by the
  -- reserve RPC / server-side sender.
  if uid is not null and not (
    public.is_platform_admin(uid)
    or public.is_agency_admin(uid, _agency_id)
    or public.is_agency_member(uid, _agency_id)
  ) then
    raise exception 'forbidden: not a member of this organisation' using errcode = '42501';
  end if;

  if _audience_kind not in ('all_opted_in', 'checked_in', 'not_checked_in', 'venue_visited') then
    raise exception 'sms_resolve_audience: unknown audience "%"', _audience_kind;
  end if;

  if _audience_kind = 'venue_visited' then
    venue := nullif(_audience_params->>'venue_id', '')::uuid;
    if venue is null then
      raise exception 'sms_resolve_audience: venue_visited requires venue_id';
    end if;
  end if;

  return query
  select distinct on (v.mobile_e164)
         v.id as visitor_id,
         p.id as passport_id,
         v.mobile_e164 as phone_e164
    from public.visitors v
    left join public.passports p
      on p.agency_id = v.agency_id
     and p.event_id = v.event_id
     and p.visitor_id = v.id
   where v.agency_id = _agency_id
     and v.event_id = _event_id
     and v.deleted_at is null
     -- Eligibility: consent for THIS channel, no opt-out, valid E.164 number.
     and v.sms_opt_in = true
     and v.sms_opt_out_at is null
     and v.mobile_e164 is not null
     and v.mobile_e164 ~ '^\+[1-9][0-9]{7,14}$'
     and (
       _audience_kind = 'all_opted_in'
       or (
         _audience_kind = 'checked_in'
         and exists (
           select 1 from public.checkins c
            where c.agency_id = v.agency_id
              and c.event_id = v.event_id
              and c.visitor_id = v.id
         )
       )
       or (
         _audience_kind = 'not_checked_in'
         and not exists (
           select 1 from public.checkins c
            where c.agency_id = v.agency_id
              and c.event_id = v.event_id
              and c.visitor_id = v.id
         )
       )
       or (
         _audience_kind = 'venue_visited'
         and exists (
           select 1 from public.checkins c
            where c.agency_id = v.agency_id
              and c.event_id = v.event_id
              and c.visitor_id = v.id
              and c.venue_id = venue
         )
       )
     )
   order by v.mobile_e164, p.created_at desc nulls last;
end;
$$;

revoke all on function public.sms_resolve_audience(uuid, uuid, text, jsonb) from public;
grant execute on function public.sms_resolve_audience(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.sms_resolve_audience(uuid, uuid, text, jsonb) to service_role;

-- Count-only variant for the composer (no PII leaves the database).
create or replace function public.sms_audience_count(
  _agency_id uuid,
  _event_id uuid,
  _audience_kind text,
  _audience_params jsonb default '{}'::jsonb
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
    from public.sms_resolve_audience(_agency_id, _event_id, _audience_kind, _audience_params);
$$;

revoke all on function public.sms_audience_count(uuid, uuid, text, jsonb) from public;
grant execute on function public.sms_audience_count(uuid, uuid, text, jsonb) to authenticated;

-- STOP / unsubscribe ------------------------------------------------------
-- Called by the inbound ClickSend webhook. Marks every visitor record holding
-- that number as opted out, across every event, with no admin intervention.
create or replace function public.sms_apply_opt_out(
  _phone_e164 text,
  _reason text default 'Inbound STOP',
  _provider_message_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical text;
  affected integer := 0;
begin
  canonical := public.sms_normalise_au_mobile(_phone_e164);
  if canonical is null then
    return 0;
  end if;

  update public.visitors
     set sms_opt_in = false,
         sms_opt_out_at = coalesce(sms_opt_out_at, now()),
         sms_opt_out_reason = coalesce(_reason, 'Inbound STOP')
   where mobile_e164 = canonical
     and (sms_opt_in = true or sms_opt_out_at is null);

  get diagnostics affected = row_count;

  -- Append to the existing consent ledger so the withdrawal is auditable.
  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, consent_type, decision, decided_at
  )
  select v.agency_id, v.event_id, v.id, 'sms', 'withdrawn', now()
    from public.visitors v
   where v.mobile_e164 = canonical;

  return affected;
end;
$$;

revoke all on function public.sms_apply_opt_out(text, text, text) from public;
grant execute on function public.sms_apply_opt_out(text, text, text) to service_role;

-- Record SMS consent at signup (or later). Positive consent only.
create or replace function public.sms_record_consent(
  _agency_id uuid,
  _event_id uuid,
  _visitor_id uuid,
  _mobile text,
  _source text default 'event_signup'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical text;
begin
  canonical := public.sms_normalise_au_mobile(_mobile);
  if canonical is null then
    return false;
  end if;

  update public.visitors
     set mobile = coalesce(nullif(btrim(_mobile), ''), mobile),
         mobile_e164 = canonical,
         sms_opt_in = true,
         sms_opt_in_at = now(),
         sms_opt_in_source = coalesce(_source, 'event_signup'),
         sms_opt_out_at = null,
         sms_opt_out_reason = null
   where agency_id = _agency_id
     and event_id = _event_id
     and id = _visitor_id;

  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, consent_type, decision, decided_at
  ) values (
    _agency_id, _event_id, _visitor_id, 'sms', 'granted', now()
  );

  return true;
end;
$$;

revoke all on function public.sms_record_consent(uuid, uuid, uuid, text, text) from public;
grant execute on function public.sms_record_consent(uuid, uuid, uuid, text, text) to service_role;

commit;
