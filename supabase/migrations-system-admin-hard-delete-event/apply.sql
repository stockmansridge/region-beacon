-- System Admin Events: hard delete + days_since_archived
--
-- 1. Extend system_admin_events() with `days_since_archived` (int, null for
--    non-archived events). archived_at is represented by the existing
--    deleted_at column.
-- 2. New platform-admin-only RPC system_admin_hard_delete_event(p_event_id)
--    that PERMANENTLY removes an already-archived event and its dependent
--    rows. Refuses to run on a non-archived event.
--
-- Dependency strategy: only tables with ON DELETE RESTRICT need explicit
-- pre-deletes. Everything else cascades from public.events. Tables that may
-- not exist in every environment are guarded with to_regclass(...).
--
-- Safety:
--   * Does NOT touch agencies, auth.users, agency_members, billing
--     subscriptions, or other events in the same organisation.
--   * Storage objects are intentionally NOT cleaned up here.
--
-- Idempotent. Safe to re-run.

set search_path = public;

-- 1. Extend system_admin_events with days_since_archived -----------------------

drop function if exists public.system_admin_events();

create or replace function public.system_admin_events()
returns table (
  event_id uuid,
  agency_id uuid,
  agency_name text,
  agency_slug text,
  event_name text,
  event_slug text,
  public_slug text,
  public_subdomain text,
  custom_domain text,
  subdomain_status text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  deleted_at timestamptz,
  days_since_archived int,
  venue_count bigint,
  passport_count bigint,
  checkin_count bigint,
  last_checkin_at timestamptz,
  activation_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_activations boolean := to_regclass('public.event_activations') is not null;
begin
  perform public._require_platform_admin();

  return query
  with primary_domain as (
    select distinct on (d.event_id)
      d.event_id,
      d.public_subdomain::text  as public_subdomain,
      d.custom_domain::text     as custom_domain,
      d.status                  as subdomain_status
    from public.event_domains d
    where d.domain_type in ('event_subdomain','event_custom')
      and (d.public_subdomain is not null or d.custom_domain is not null)
    order by d.event_id, d.is_primary desc, d.updated_at desc
  )
  select
    e.id,
    e.agency_id,
    a.name,
    a.slug::text,
    e.name,
    e.slug::text,
    e.public_slug::text,
    pd.public_subdomain,
    pd.custom_domain,
    pd.subdomain_status,
    e.status,
    e.starts_at,
    e.ends_at,
    e.created_at,
    e.deleted_at,
    case
      when e.deleted_at is not null
        then floor(extract(epoch from (now() - e.deleted_at)) / 86400)::int
      else null
    end as days_since_archived,
    (select count(*) from public.venues v where v.event_id = e.id and v.deleted_at is null),
    (select count(*) from public.passports p where p.event_id = e.id),
    (select count(*) from public.checkins c where c.event_id = e.id),
    (select max(c.created_at) from public.checkins c where c.event_id = e.id),
    case when has_activations then (
      select ea.status from public.event_activations ea where ea.event_id = e.id limit 1
    ) else null end as activation_status
  from public.events e
  join public.agencies a on a.id = e.agency_id
  left join primary_domain pd on pd.event_id = e.id
  order by (e.deleted_at is not null), e.created_at desc;
end
$$;

revoke all on function public.system_admin_events() from public;
grant execute on function public.system_admin_events() to authenticated;

-- 2. Hard delete (platform-admin, archived-only) -----------------------------

create or replace function public.system_admin_hard_delete_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event       public.events%rowtype;
  v_name        text;
  v_agency_id   uuid;
  v_domains     int := 0;
  v_checkins    int := 0;
  v_consents    int := 0;
  v_visitors    int := 0;
  v_terms       int := 0;
  v_exports     int := 0;
  v_passports   int := 0;
  v_venues      int := 0;
  v_activations int := 0;
  v_billing     int := 0;
  v_event_rows  int := 0;
begin
  perform public._require_platform_admin();

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = '22023';
  end if;

  if v_event.deleted_at is null then
    raise exception 'Event must be archived before it can be permanently deleted.'
      using errcode = '22023';
  end if;

  v_name      := v_event.name;
  v_agency_id := v_event.agency_id;

  -- Capture counts before deletion (for the response payload).
  select count(*) into v_venues
    from public.venues where event_id = p_event_id;
  select count(*) into v_passports
    from public.passports where event_id = p_event_id;
  select count(*) into v_checkins
    from public.checkins where event_id = p_event_id;

  -- Release any remaining domain rows. Cascades on event delete anyway,
  -- but doing it first guarantees no stale subdomain rows survive in any
  -- edge-case ordering.
  delete from public.event_domains where event_id = p_event_id;
  get diagnostics v_domains = row_count;

  -- ON DELETE RESTRICT tables: must be cleared explicitly.
  delete from public.checkins where event_id = p_event_id;
  get diagnostics v_checkins = row_count;

  if to_regclass('public.visitor_consents') is not null then
    execute 'delete from public.visitor_consents where event_id = $1'
      using p_event_id;
    get diagnostics v_consents = row_count;
  end if;

  if to_regclass('public.visitors') is not null then
    execute 'delete from public.visitors where event_id = $1'
      using p_event_id;
    get diagnostics v_visitors = row_count;
  end if;

  if to_regclass('public.event_terms_versions') is not null then
    execute 'delete from public.event_terms_versions where event_id = $1'
      using p_event_id;
    get diagnostics v_terms = row_count;
  end if;

  if to_regclass('public.export_logs') is not null then
    execute 'delete from public.export_logs where event_id = $1'
      using p_event_id;
    get diagnostics v_exports = row_count;
  end if;

  -- Activations cascade, but count for visibility.
  if to_regclass('public.event_activations') is not null then
    execute 'select count(*) from public.event_activations where event_id = $1'
      into v_activations using p_event_id;
  end if;

  -- billing_events FKs to events with ON DELETE SET NULL; rows are preserved
  -- for accounting. Count for the response payload.
  if to_regclass('public.billing_events') is not null then
    execute 'select count(*) from public.billing_events where event_id = $1'
      into v_billing using p_event_id;
  end if;

  -- Finally remove the event. Remaining child rows cascade.
  delete from public.events where id = p_event_id;
  get diagnostics v_event_rows = row_count;

  if v_event_rows = 0 then
    raise exception 'Event row could not be deleted.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'event_name', v_name,
    'agency_id', v_agency_id,
    'deleted', jsonb_build_object(
      'event_domains', v_domains,
      'checkins', v_checkins,
      'visitor_consents', v_consents,
      'visitors', v_visitors,
      'event_terms_versions', v_terms,
      'export_logs', v_exports,
      'venues_cascaded', v_venues,
      'passports_cascaded', v_passports,
      'event_activations_cascaded', v_activations,
      'billing_events_nulled', v_billing
    )
  );
end;
$$;

revoke all on function public.system_admin_hard_delete_event(uuid) from public;
grant execute on function public.system_admin_hard_delete_event(uuid) to authenticated;

-- Verify
-- select * from public.system_admin_events() limit 5;
-- select public.system_admin_hard_delete_event('<archived-event-uuid>');
