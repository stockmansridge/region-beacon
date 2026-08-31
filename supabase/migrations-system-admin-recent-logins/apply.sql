-- Recent logins for the System Admin overview.
--
-- Idempotent, additive, read-only. SECURITY DEFINER + platform_admin gate,
-- EXECUTE granted to authenticated only.

set search_path = public;

create or replace function public.system_admin_recent_logins(_limit int default 25)
returns table (
  user_id uuid,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  is_platform_admin boolean,
  agency_id uuid,
  agency_name text,
  agency_role text
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
    u.id,
    u.email::text,
    u.last_sign_in_at,
    u.created_at,
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = u.id and ur.role = 'platform_admin'
    ) as is_platform_admin,
    m.agency_id,
    a.name as agency_name,
    m.role::text as agency_role
  from auth.users u
  left join lateral (
    select am.agency_id, am.role
    from public.agency_members am
    where am.user_id = u.id
      and am.accepted_at is not null
    order by am.created_at asc
    limit 1
  ) m on true
  left join public.agencies a on a.id = m.agency_id
  where u.last_sign_in_at is not null
  order by u.last_sign_in_at desc
  limit greatest(1, least(coalesce(_limit, 25), 200));
end
$$;

revoke all on function public.system_admin_recent_logins(int) from public;
grant execute on function public.system_admin_recent_logins(int) to authenticated;

-- Make the new function visible to the Data API immediately.
notify pgrst, 'reload schema';


-- Verify (as a platform_admin user):
-- select * from public.system_admin_recent_logins(25);
