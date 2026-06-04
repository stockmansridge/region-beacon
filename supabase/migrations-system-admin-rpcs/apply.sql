-- System Admin RPCs — production apply
--
-- Idempotent. Safe to re-run. Read-only aggregations over existing tables.
-- Every RPC is SECURITY DEFINER and gates on public.is_platform_admin(auth.uid())
-- so non-platform-admin callers get an exception (no data leak).
--
-- Grants EXECUTE to authenticated only. No anon. No service_role usage in
-- frontend. Tables referenced: agencies, agency_members, events, venues,
-- visitors, passports, checkins, audit_logs, event_activations (optional),
-- agency_billing_accounts (optional). Optional tables are referenced via
-- to_regclass() so the RPC degrades cleanly if a table is not present.

set search_path = public;

-- ---------------------------------------------------------------------------
-- Guard helper: raise if caller is not a platform admin.
-- ---------------------------------------------------------------------------
create or replace function public._require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden: platform_admin required'
      using errcode = '42501';
  end if;
end
$$;

revoke all on function public._require_platform_admin() from public;
grant execute on function public._require_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Overview — single-row counts for top-level summary cards.
-- ---------------------------------------------------------------------------
create or replace function public.system_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public._require_platform_admin();

  select jsonb_build_object(
    'total_organisations',     (select count(*) from public.agencies where deleted_at is null),
    'active_organisations',    (select count(*) from public.agencies where deleted_at is null and status = 'active'),
    'organisations_this_month',(select count(*) from public.agencies
                                where deleted_at is null
                                  and created_at >= date_trunc('month', now())),
    'total_events',            (select count(*) from public.events where deleted_at is null),
    'published_events',        (select count(*) from public.events where deleted_at is null and status = 'published'),
    'draft_events',            (select count(*) from public.events where deleted_at is null and status = 'draft'),
    'total_venues',            (select count(*) from public.venues where deleted_at is null),
    'total_passports',         (select count(*) from public.passports),
    'total_checkins',          (select count(*) from public.checkins),
    'checkins_24h',            (select count(*) from public.checkins where created_at >= now() - interval '24 hours'),
    'checkins_7d',             (select count(*) from public.checkins where created_at >= now() - interval '7 days')
  ) into result;

  return result;
end
$$;

revoke all on function public.system_admin_overview() from public;
grant execute on function public.system_admin_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Organisations — one row per agency with rollups.
-- ---------------------------------------------------------------------------
create or replace function public.system_admin_organisations()
returns table (
  agency_id uuid,
  name text,
  slug text,
  status text,
  billing_email text,
  created_at timestamptz,
  owner_email text,
  member_count bigint,
  event_count bigint,
  published_event_count bigint,
  venue_count bigint,
  passport_count bigint,
  checkin_count bigint
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
    a.id,
    a.name,
    a.slug::text,
    a.status,
    a.billing_email::text,
    a.created_at,
    (
      select u.email::text
      from public.agency_members am
      join auth.users u on u.id = am.user_id
      where am.agency_id = a.id
        and am.role = 'agency_owner'
        and am.accepted_at is not null
      order by am.created_at asc
      limit 1
    ) as owner_email,
    (select count(*) from public.agency_members am
       where am.agency_id = a.id and am.accepted_at is not null) as member_count,
    (select count(*) from public.events e
       where e.agency_id = a.id and e.deleted_at is null) as event_count,
    (select count(*) from public.events e
       where e.agency_id = a.id and e.deleted_at is null and e.status = 'published') as published_event_count,
    (select count(*) from public.venues v
       where v.agency_id = a.id and v.deleted_at is null) as venue_count,
    (select count(*) from public.passports p
       where p.agency_id = a.id) as passport_count,
    (select count(*) from public.checkins c
       where c.agency_id = a.id) as checkin_count
  from public.agencies a
  where a.deleted_at is null
  order by a.created_at desc;
end
$$;

revoke all on function public.system_admin_organisations() from public;
grant execute on function public.system_admin_organisations() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Users — platform admins + agency members (accepted + pending).
-- ---------------------------------------------------------------------------
create or replace function public.system_admin_users()
returns table (
  user_id uuid,
  email text,
  role text,
  scope text,            -- 'platform' | 'organisation'
  agency_id uuid,
  agency_name text,
  invited_email text,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_platform_admin();

  return query
  -- Platform admins (global)
  select
    ur.user_id,
    u.email::text,
    ur.role::text,
    'platform'::text as scope,
    null::uuid as agency_id,
    null::text as agency_name,
    null::text as invited_email,
    null::timestamptz as invited_at,
    ur.created_at as accepted_at,
    ur.created_at
  from public.user_roles ur
  left join auth.users u on u.id = ur.user_id
  where ur.role = 'platform_admin'

  union all

  -- Agency members (accepted + pending)
  select
    am.user_id,
    coalesce(u.email::text, am.invited_email::text) as email,
    am.role::text,
    'organisation'::text as scope,
    am.agency_id,
    a.name as agency_name,
    am.invited_email::text,
    case when am.accepted_at is null then am.created_at else null end as invited_at,
    am.accepted_at,
    am.created_at
  from public.agency_members am
  left join public.agencies a on a.id = am.agency_id
  left join auth.users u on u.id = am.user_id

  order by created_at desc;
end
$$;

revoke all on function public.system_admin_users() from public;
grant execute on function public.system_admin_users() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Events — every event across organisations with rollups.
-- ---------------------------------------------------------------------------
create or replace function public.system_admin_events()
returns table (
  event_id uuid,
  agency_id uuid,
  agency_name text,
  agency_slug text,
  event_name text,
  event_slug text,
  public_slug text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
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
  select
    e.id,
    e.agency_id,
    a.name,
    a.slug::text,
    e.name,
    e.slug::text,
    e.public_slug::text,
    e.status,
    e.starts_at,
    e.ends_at,
    e.created_at,
    (select count(*) from public.venues v where v.event_id = e.id and v.deleted_at is null),
    (select count(*) from public.passports p where p.event_id = e.id),
    (select count(*) from public.checkins c where c.event_id = e.id),
    (select max(c.created_at) from public.checkins c where c.event_id = e.id),
    case when has_activations then (
      select ea.status from public.event_activations ea where ea.event_id = e.id limit 1
    ) else null end as activation_status
  from public.events e
  join public.agencies a on a.id = e.agency_id
  where e.deleted_at is null
  order by e.created_at desc;
end
$$;

revoke all on function public.system_admin_events() from public;
grant execute on function public.system_admin_events() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit logs — recent entries (capped). Returns 0 rows if table absent.
-- ---------------------------------------------------------------------------
create or replace function public.system_admin_audit_logs(_limit int default 200)
returns table (
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  action text,
  agency_id uuid,
  agency_name text,
  event_id uuid,
  event_name text,
  target_table text,
  target_id uuid,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_platform_admin();

  if to_regclass('public.audit_logs') is null then
    return;
  end if;

  return query
  select
    al.id,
    al.created_at,
    al.actor_user_id,
    u.email::text,
    al.actor_role,
    al.action,
    al.agency_id,
    a.name,
    al.event_id,
    e.name,
    al.target_table,
    al.target_id,
    al.metadata
  from public.audit_logs al
  left join auth.users u on u.id = al.actor_user_id
  left join public.agencies a on a.id = al.agency_id
  left join public.events e on e.id = al.event_id
  order by al.created_at desc
  limit greatest(1, least(coalesce(_limit, 200), 1000));
end
$$;

revoke all on function public.system_admin_audit_logs(int) from public;
grant execute on function public.system_admin_audit_logs(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- select public.system_admin_overview();
-- select * from public.system_admin_organisations() limit 5;
-- select * from public.system_admin_users() limit 20;
-- select * from public.system_admin_events() limit 20;
-- select * from public.system_admin_audit_logs(50);
