-- 03_sms_consent.sql
-- GetStampd SMS Messaging — SMS-specific consent, E.164 numbers, opt-out.
--
-- What this does:
--   * adds a canonical E.164 mobile + SMS consent/opt-out columns to
--     public.visitors (additive; existing rows default to NOT opted in)
--   * widens public.visitor_consents.consent_type to include 'sms' so the
--     existing append-only consent ledger records SMS consent too
--   * adds public.sms_normalise_au_mobile() used everywhere a number is stored
--
-- IMPORTANT: existing `marketing_opt_in` is EMAIL marketing consent and is
-- deliberately NOT treated as SMS consent (Spam Act 2003 requires consent for
-- the channel). Nothing is backfilled as opted-in.
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

-- Canonical AU mobile normaliser. Returns E.164 (+61...) or null when the
-- number cannot be trusted as a mobile.
create or replace function public.sms_normalise_au_mobile(_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text;
begin
  if _raw is null then
    return null;
  end if;

  -- Keep a leading + so international numbers survive, strip everything else.
  digits := regexp_replace(_raw, '[^0-9+]', '', 'g');
  if digits = '' then
    return null;
  end if;

  -- Already E.164 AU mobile: +614XXXXXXXX
  if digits ~ '^\+614[0-9]{8}$' then
    return digits;
  end if;
  -- Other already-E.164 international number: accept as-is.
  if digits ~ '^\+[1-9][0-9]{7,14}$' then
    return digits;
  end if;

  digits := regexp_replace(digits, '\+', '', 'g');

  -- 614XXXXXXXX
  if digits ~ '^614[0-9]{8}$' then
    return '+' || digits;
  end if;
  -- 04XXXXXXXX (national format)
  if digits ~ '^04[0-9]{8}$' then
    return '+61' || substring(digits from 2);
  end if;
  -- 4XXXXXXXX (leading zero dropped)
  if digits ~ '^4[0-9]{8}$' then
    return '+61' || digits;
  end if;

  return null;
end;
$$;

-- Visitor columns ---------------------------------------------------------
alter table public.visitors
  add column if not exists mobile_e164 text,
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists sms_opt_in_at timestamptz,
  add column if not exists sms_opt_in_source text,
  add column if not exists sms_opt_out_at timestamptz,
  add column if not exists sms_opt_out_reason text;

do $$ begin
  alter table public.visitors
    add constraint visitors_mobile_e164_format
    check (mobile_e164 is null or mobile_e164 ~ '^\+[1-9][0-9]{7,14}$');
exception when duplicate_object then null; end $$;

-- Backfill the canonical number only. Consent state is untouched.
update public.visitors
   set mobile_e164 = public.sms_normalise_au_mobile(mobile)
 where mobile is not null
   and mobile_e164 is null;

create index if not exists idx_visitors_sms_eligible
  on public.visitors (agency_id, event_id)
  where sms_opt_in = true and sms_opt_out_at is null and mobile_e164 is not null;
create index if not exists idx_visitors_mobile_e164
  on public.visitors (mobile_e164) where mobile_e164 is not null;

-- Consent ledger: allow consent_type = 'sms' ------------------------------
do $$
declare
  con_name text;
begin
  select conname into con_name
    from pg_constraint
   where conrelid = 'public.visitor_consents'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%consent_type%'
   limit 1;

  if con_name is not null then
    execute format('alter table public.visitor_consents drop constraint %I', con_name);
  end if;

  alter table public.visitor_consents
    add constraint visitor_consents_consent_type_check
    check (consent_type in ('terms', 'privacy', 'marketing', 'sms'));
end $$;

-- The existing "terms/privacy require a version" constraint already ignores
-- other consent types, so 'sms' needs no version. Verified, no change needed.

commit;
