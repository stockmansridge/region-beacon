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
