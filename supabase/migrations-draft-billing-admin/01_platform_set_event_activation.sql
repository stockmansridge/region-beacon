-- 01_platform_set_event_activation.sql
-- Draft only. Do not execute.
--
-- Platform-admin-only manual event activation RPC for staging/testing.
--
-- Safety model:
--   * SECURITY DEFINER so the function can write to event_activations and
--     billing_events without depending on per-table RLS write policies.
--   * First statement inside the body enforces is_platform_admin(auth.uid()).
--     Any non-platform_admin caller is rejected before any write happens.
--   * EXECUTE granted to `authenticated` only. anon is never granted execute.
--   * The function does NOT touch events.status, event_domains.status, or
--     anything that would make a public subdomain go live. It only writes
--     to event_activations and appends a billing_events audit row.
--   * activated_at is preserved on transitions to non-active states so we
--     keep historical activation timestamps for support/audit purposes.
--     Re-activation re-stamps activated_at only when it was previously null.

create or replace function public.platform_set_event_activation(
  _event_id uuid,
  _status text,
  _activation_kind text default 'comp',
  _expires_at timestamptz default null
)
returns public.event_activations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_agency_id uuid;
  v_old public.event_activations;
  v_new public.event_activations;
  v_activated_at timestamptz;
begin
  -- 1. Authentication
  if v_caller is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  -- 2. Platform admin gate
  if not public.is_platform_admin(v_caller) then
    raise exception 'access denied: platform_admin required'
      using errcode = '42501';
  end if;

  -- 3. Validate status / kind
  if _status not in ('unpaid','active','past_due','cancelled','comp') then
    raise exception 'invalid status: %', _status
      using errcode = '22023';
  end if;

  if _activation_kind not in ('one_time','included_in_plan','comp') then
    raise exception 'invalid activation_kind: %', _activation_kind
      using errcode = '22023';
  end if;

  -- 4. Resolve agency from event
  select agency_id into v_agency_id
    from public.events
   where id = _event_id;

  if v_agency_id is null then
    raise exception 'event not found: %', _event_id
      using errcode = '22023';
  end if;

  -- 5. Capture old row (may be null)
  select * into v_old
    from public.event_activations
   where event_id = _event_id;

  -- 6. Decide activated_at:
  --    - active/comp: stamp now() if it was never activated before;
  --      otherwise preserve the original activation timestamp.
  --    - other states: preserve existing activated_at (keep history).
  if _status in ('active','comp') then
    v_activated_at := coalesce(v_old.activated_at, now());
  else
    v_activated_at := v_old.activated_at;
  end if;

  -- 7. Upsert
  insert into public.event_activations (
    agency_id, event_id, status, activation_kind, activated_at, expires_at
  ) values (
    v_agency_id, _event_id, _status, _activation_kind, v_activated_at, _expires_at
  )
  on conflict (event_id) do update
    set status          = excluded.status,
        activation_kind = excluded.activation_kind,
        activated_at    = excluded.activated_at,
        expires_at      = excluded.expires_at,
        agency_id       = excluded.agency_id,
        updated_at      = now()
  returning * into v_new;

  -- 8. Audit row
  insert into public.billing_events (
    agency_id, event_id, source, event_type, actor_user_id, payload
  ) values (
    v_agency_id,
    _event_id,
    'admin_action',
    'platform.manual_event_activation',
    v_caller,
    jsonb_build_object(
      'old_status',       v_old.status,
      'new_status',       _status,
      'activation_kind',  _activation_kind,
      'expires_at',       _expires_at,
      'activated_at',     v_activated_at
    )
  );

  return v_new;
end;
$$;

revoke all on function public.platform_set_event_activation(uuid, text, text, timestamptz) from public;
revoke all on function public.platform_set_event_activation(uuid, text, text, timestamptz) from anon;
grant execute on function public.platform_set_event_activation(uuid, text, text, timestamptz) to authenticated;
