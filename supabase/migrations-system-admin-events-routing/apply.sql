-- System Admin Events: routing + archive controls
--
-- 1. Extend system_admin_events() to include subdomain routing fields and
--    return archived events too (frontend can filter by status). Adds
--    public_subdomain, custom_domain, subdomain_status, deleted_at.
-- 2. New RPC system_admin_active_events_with_subdomain() returns every
--    non-archived event that currently owns a public_subdomain so platform
--    admins can see who holds a label before reusing it.
-- 3. New RPC system_admin_archive_event(p_event_id) lets platform admin
--    soft-delete an event from the System Admin screen. The existing
--    trg_release_event_subdomains_on_archive trigger releases the label.
-- 4. New RPC system_admin_unarchive_event(p_event_id) restores an archived
--    event as a draft (does NOT restore the freed subdomain — by that point
--    another event may have claimed it).
--
-- Idempotent. Safe to re-run.

set search_path = public;

-- 1. system_admin_events: extended return shape -------------------------------

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

-- 2. Active (non-archived) events that hold a subdomain ----------------------

create or replace function public.system_admin_active_events_with_subdomain()
returns table (
  event_id          uuid,
  agency_id         uuid,
  agency_name       text,
  event_name        text,
  status            text,
  public_subdomain  text,
  domain_status     text,
  created_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_platform_admin();

  return query
  select
    e.id,
    e.agency_id,
    a.name,
    e.name,
    e.status,
    d.public_subdomain::text,
    d.status,
    e.created_at
  from public.events e
  join public.agencies a      on a.id = e.agency_id
  join public.event_domains d on d.event_id = e.id
  where e.deleted_at is null
    and d.domain_type = 'event_subdomain'
    and d.public_subdomain is not null
  order by d.public_subdomain asc;
end
$$;

revoke all on function public.system_admin_active_events_with_subdomain() from public;
grant execute on function public.system_admin_active_events_with_subdomain() to authenticated;

-- 3. Platform-admin archive (soft delete) ------------------------------------

create or replace function public.system_admin_archive_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  perform public._require_platform_admin();

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = '22023';
  end if;
  if v_event.deleted_at is not null then
    return jsonb_build_object(
      'success', true,
      'event_id', p_event_id,
      'already_archived', true
    );
  end if;

  -- Triggers tg_release_event_subdomains_on_archive on this update.
  update public.events
     set deleted_at = now(),
         status     = 'archived'
   where id = p_event_id;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'already_archived', false
  );
end;
$$;

revoke all on function public.system_admin_archive_event(uuid) from public;
grant execute on function public.system_admin_archive_event(uuid) to authenticated;

-- 4. Platform-admin unarchive (restore as draft) -----------------------------

create or replace function public.system_admin_unarchive_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  perform public._require_platform_admin();

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = '22023';
  end if;
  if v_event.deleted_at is null then
    return jsonb_build_object(
      'success', true,
      'event_id', p_event_id,
      'already_active', true
    );
  end if;

  update public.events
     set deleted_at = null,
         status     = 'draft'
   where id = p_event_id;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'already_active', false
  );
end;
$$;

revoke all on function public.system_admin_unarchive_event(uuid) from public;
grant execute on function public.system_admin_unarchive_event(uuid) to authenticated;

-- Verify
-- select * from public.system_admin_events() limit 5;
-- select * from public.system_admin_active_events_with_subdomain();
-- select public.system_admin_archive_event('<event-uuid>');
-- select public.system_admin_unarchive_event('<event-uuid>');
