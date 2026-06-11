-- claim_event_subdomain — single server-side entry point for claiming,
-- reserving, and activating GetStampd event subdomains.
--
-- Why: normal (non-platform-admin) users were ending up with rows stuck on
-- status='pending' because the client-side INSERT/UPDATE of
-- event_domains.status was being blocked / not applied by RLS. All
-- claim/reserve/activate transitions now happen inside this
-- SECURITY DEFINER RPC with explicit permission checks.
--
-- Behaviour matrix (plan via public.agency_effective_plan_code):
--   free  + draft      -> insert/keep pending, is_primary=true   -> 'reserved_publish_to_go_live'
--   free  + published  -> active, is_primary=true, verified_at   -> 'activated_live'
--   free  + published + existing pending row (no _subdomain arg) -> activate it -> 'activated_live'
--   paid  (any status) -> insert/keep pending (billing flow unchanged) -> 'reserved_pending_billing'
--
-- Never touches event_activations. Reserved/taken/format rules delegate to
-- the existing validate_public_subdomain RPC (released/deleted-event rules
-- unchanged).
--
-- Idempotent. Safe to re-run.

set search_path = public;

create or replace function public.claim_event_subdomain(
  _event_id uuid,
  _subdomain text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_plan text;
  v_is_free boolean;
  v_label citext;
  v_row public.event_domains%rowtype;
  v_valid record;
  v_activate boolean;
  v_status text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated',
      'message', 'You must be signed in.');
  end if;

  select * into v_event
    from public.events e
   where e.id = _event_id
     and e.deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found',
      'message', 'Event not found.');
  end if;

  -- Permission: platform admin OR accepted agency owner/admin of the event's agency.
  if not (
    public.has_role(v_uid, 'platform_admin'::app_role)
    or exists (
      select 1 from public.agency_members am
       where am.user_id = v_uid
         and am.agency_id = v_event.agency_id
         and am.accepted_at is not null
         and am.role in ('agency_owner','agency_admin')
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized',
      'message', 'You do not have permission to manage this event''s public address.');
  end if;

  v_plan := lower(coalesce(public.agency_effective_plan_code(v_event.agency_id), 'free'));
  v_is_free := (v_plan = 'free');
  v_activate := v_is_free and v_event.status = 'published';

  -- Existing event_subdomain row for this event (if any).
  select * into v_row
    from public.event_domains d
   where d.event_id = _event_id
     and d.domain_type = 'event_subdomain'
   order by d.updated_at desc nulls last, d.created_at desc
   limit 1;

  if _subdomain is null or btrim(_subdomain) = '' then
    -- Activation path: requires an existing row.
    if v_row.id is null then
      return jsonb_build_object('ok', false, 'reason', 'no_subdomain',
        'message', 'No subdomain reserved for this event yet.',
        'plan_code', v_plan, 'event_status', v_event.status);
    end if;
    v_label := v_row.public_subdomain;
  else
    v_label := lower(btrim(_subdomain));
    -- If the event already holds this exact label, treat as activate-in-place.
    if v_row.id is not null and v_row.public_subdomain is distinct from v_label then
      return jsonb_build_object('ok', false, 'reason', 'already_claimed',
        'message', 'This event already has a public address. Use Change address instead.',
        'plan_code', v_plan, 'event_status', v_event.status,
        'domain_status', v_row.status);
    end if;
    if v_row.id is null then
      -- New claim: validate format / reserved / taken via the canonical RPC.
      select * into v_valid from public.validate_public_subdomain(v_label::text);
      if not coalesce(v_valid.ok, false) then
        return jsonb_build_object('ok', false, 'reason', coalesce(v_valid.reason, 'invalid'),
          'message', case coalesce(v_valid.reason, 'invalid')
            when 'length'   then 'Must be 3–63 characters.'
            when 'format'   then 'Invalid format.'
            when 'reserved' then 'That label is reserved by GetStampd.'
            when 'taken'    then 'That subdomain is already taken.'
            else 'That subdomain is not available.' end,
          'plan_code', v_plan, 'event_status', v_event.status);
      end if;
    end if;
  end if;

  v_status := case when v_activate then 'active' else 'pending' end;

  if v_row.id is null then
    insert into public.event_domains
      (agency_id, event_id, public_subdomain, domain_type, status, is_primary, verified_at)
    values
      (v_event.agency_id, _event_id, v_label, 'event_subdomain', v_status, true,
       case when v_activate then now() else null end)
    returning * into v_row;
  else
    if v_activate and v_row.status = 'pending' then
      update public.event_domains
         set status = 'active',
             is_primary = true,
             verified_at = coalesce(verified_at, now()),
             updated_at = now()
       where id = v_row.id
       returning * into v_row;
    elsif v_row.status = 'active' then
      -- Already active: ensure primary flag, no-op otherwise.
      update public.event_domains
         set is_primary = true, updated_at = now()
       where id = v_row.id and is_primary = false;
      v_row.is_primary := true;
    end if;
  end if;

  -- Clear stale primary flags on other domains for this event.
  update public.event_domains
     set is_primary = false, updated_at = now()
   where event_id = _event_id
     and id <> v_row.id
     and is_primary = true;

  return jsonb_build_object(
    'ok', true,
    'status', case
      when v_row.status = 'active' then 'activated_live'
      when v_is_free then 'reserved_publish_to_go_live'
      else 'reserved_pending_billing' end,
    'message', case
      when v_row.status = 'active' then 'Public address activated. Your public site is live.'
      when v_is_free then 'Public address reserved. Publish your event to make it live.'
      else 'Public address reserved. It activates after billing/activation.' end,
    'plan_code', v_plan,
    'event_status', v_event.status,
    'domain_status', v_row.status,
    'is_primary', v_row.is_primary,
    'verified_at', v_row.verified_at,
    'subdomain', v_row.public_subdomain,
    'activation_attempted', v_activate
  );
end;
$$;

revoke all on function public.claim_event_subdomain(uuid, text) from public, anon;
grant execute on function public.claim_event_subdomain(uuid, text) to authenticated;
