-- System Admin → Organisations: expose effective plan
--
-- Adds plan columns to system_admin_organisations() so the main Organisations
-- table in System Admin can render the effective plan (and its source) for
-- every customer at a glance.
--
-- Effective plan priority is delegated to public.get_agency_plan_limits(uuid)
-- which already resolves:
--     manual_plan_override ?? active_subscription_plan ?? free
--
-- Idempotent. Safe to re-run. Read-only. SECURITY DEFINER, platform-admin gated.

set search_path = public;

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
  checkin_count bigint,
  effective_plan_code text,
  plan_source text,
  manual_plan_override text,
  manual_plan_override_at timestamptz
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
       where c.agency_id = a.id) as checkin_count,
    (plan.limits ->> 'plan_code')::text as effective_plan_code,
    (plan.limits ->> 'plan_source')::text as plan_source,
    a.manual_plan_override::text,
    a.manual_plan_override_at
  from public.agencies a
  left join lateral (
    select public.get_agency_plan_limits(a.id) as limits
  ) plan on true
  where a.deleted_at is null
  order by a.created_at desc;
end
$$;

revoke all on function public.system_admin_organisations() from public;
grant execute on function public.system_admin_organisations() to authenticated;

-- Verify:
-- select agency_id, name, effective_plan_code, plan_source, manual_plan_override
--   from public.system_admin_organisations() limit 20;
