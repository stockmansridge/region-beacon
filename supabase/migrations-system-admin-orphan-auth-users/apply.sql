-- System Admin: orphan auth users diagnostic.
--
-- Lists auth.users that have NO platform role (user_roles) and NO agency
-- membership (agency_members). These are accounts that exist in Supabase
-- Auth but cannot access anything in the app. They appear when a user
-- starts signup but never completes organisation creation, or when an
-- agency membership is later removed.
--
-- SECURITY DEFINER + gated to platform_admin only. Returns email + minimal
-- timestamps; never returns password hashes or other auth internals.

set search_path = public;

create or replace function public.system_admin_orphan_auth_users()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
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
    u.id          as user_id,
    u.email::text as email,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  from auth.users u
  where not exists (
    select 1 from public.user_roles ur where ur.user_id = u.id
  )
  and not exists (
    select 1 from public.agency_members am where am.user_id = u.id
  )
  order by u.created_at desc;
end
$$;

revoke all on function public.system_admin_orphan_auth_users() from public;
grant execute on function public.system_admin_orphan_auth_users() to authenticated;
