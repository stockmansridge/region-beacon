-- System Admin Events: add the linked user (organisation owner) to the
-- events listing so support can see who an event belongs to.
--
-- Adds two columns to public.system_admin_events():
--   owner_name  — full name from auth.users raw_user_meta_data when present,
--                 otherwise the email local-part, otherwise null.
--   owner_email — email of the earliest accepted agency_owner for the event's
--                 organisation; falls back to any accepted member, then to
--                 the agency billing_email.
--
-- Idempotent. Safe to re-run.

set search_path = public;

drop function if exists public.system_admin_events();

create or replace function public.system_admin_events()
returns table (
  event_id uuid,
  agency_id uuid,
  agency_name text,
  agency_slug text,
  owner_name text,
  owner_email text,
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
  ),
  agency_owner as (
    select distinct on (am.agency_id)
      am.agency_id,
      u.email::text as owner_email,
      nullif(trim(coalesce(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name',
        concat_ws(' ',
          u.raw_user_meta_data ->> 'first_name',
          u.raw_user_meta_data ->> 'last_name')
      )), '') as owner_name
    from public.agency_members am
    join auth.users u on u.id = am.user_id
    where am.accepted_at is not null
    order by am.agency_id,
             (am.role = 'agency_owner') desc,
             am.created_at asc
  )
  select
    e.id,
    e.agency_id,
    a.name,
    a.slug::text,
    coalesce(
      ao.owner_name,
      split_part(coalesce(ao.owner_email, a.billing_email::text), '@', 1)
    ) as owner_name,
    coalesce(ao.owner_email, a.billing_email::text) as owner_email,
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
  left join agency_owner ao on ao.agency_id = e.agency_id
  order by (e.deleted_at is not null), e.created_at desc;
end
$$;

revoke all on function public.system_admin_events() from public;
grant execute on function public.system_admin_events() to authenticated;

notify pgrst, 'reload schema';
