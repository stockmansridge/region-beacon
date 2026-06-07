-- System Admin: delete orphan auth user
--
-- Lets a platform_admin delete an auth.users row only if the target user
-- is genuinely orphaned: no public.user_roles row and no
-- public.agency_members row. This is intended for cleaning up test or
-- abandoned signup accounts surfaced by system_admin_orphan_auth_users().
--
-- Safety gates:
--   * caller must be platform_admin (_require_platform_admin())
--   * caller cannot delete themselves
--   * target must exist in auth.users
--   * target must have zero rows in user_roles AND agency_members
--
-- Errors raised (frontend maps to friendly copy):
--   * cannot_delete_self
--   * orphan_user_not_found_or_no_longer_orphaned

set search_path = public;

create or replace function public.system_admin_delete_orphan_auth_user(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  exists_in_auth boolean := false;
  has_role boolean := false;
  has_membership boolean := false;
begin
  perform public._require_platform_admin();

  if _user_id is null then
    raise exception 'orphan_user_not_found_or_no_longer_orphaned'
      using errcode = 'P0002';
  end if;

  if _user_id = caller_id then
    raise exception 'cannot_delete_self'
      using errcode = '42501';
  end if;

  select exists(select 1 from auth.users where id = _user_id) into exists_in_auth;
  if not exists_in_auth then
    raise exception 'orphan_user_not_found_or_no_longer_orphaned'
      using errcode = 'P0002';
  end if;

  select exists(select 1 from public.user_roles where user_id = _user_id) into has_role;
  select exists(select 1 from public.agency_members where user_id = _user_id) into has_membership;

  if has_role or has_membership then
    raise exception 'orphan_user_not_found_or_no_longer_orphaned'
      using errcode = 'P0002';
  end if;

  delete from auth.users where id = _user_id;
end
$$;

revoke all on function public.system_admin_delete_orphan_auth_user(uuid) from public;
grant execute on function public.system_admin_delete_orphan_auth_user(uuid) to authenticated;
