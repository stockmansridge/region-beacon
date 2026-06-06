-- System Admin: delete user
--
-- Idempotent SECURITY DEFINER RPC that lets a platform_admin delete a user
-- account end-to-end:
--   1. Removes app-level membership records (agency_members)
--   2. Removes user_roles assignments
--   3. Deletes the auth.users row
--
-- Gates:
--   - Caller must satisfy public.is_platform_admin(auth.uid()).
--   - Caller cannot delete themselves.
--
-- Returns: jsonb { success, deleted_user_id, deleted_agency_members,
--                  deleted_user_roles, was_platform_admin }
-- Raises on failure with a clear errcode/message; the frontend surfaces the
-- raw message back to the platform admin.

set search_path = public;

create or replace function public.system_admin_delete_user(_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id          uuid := auth.uid();
  deleted_members    int  := 0;
  deleted_roles      int  := 0;
  was_platform_admin boolean := false;
  exists_in_auth     boolean := false;
begin
  if caller_id is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  if not public.is_platform_admin(caller_id) then
    raise exception 'Only platform admins can delete users.'
      using errcode = '42501';
  end if;

  if _target_user_id is null then
    raise exception 'Target user_id is required.'
      using errcode = '22023';
  end if;

  if _target_user_id = caller_id then
    raise exception 'You cannot delete your own platform admin account.'
      using errcode = '42501';
  end if;

  select exists(select 1 from auth.users where id = _target_user_id)
    into exists_in_auth;

  if not exists_in_auth then
    raise exception 'User not found.'
      using errcode = 'P0002';
  end if;

  -- Was this user a platform admin? (informational, surfaced in response)
  select public.is_platform_admin(_target_user_id) into was_platform_admin;

  -- Clean app-level rows first. Both tables also cascade from auth.users,
  -- but explicit deletes keep behaviour clear and tell us the row counts.
  with d as (
    delete from public.agency_members
     where user_id = _target_user_id
     returning 1
  )
  select count(*) into deleted_members from d;

  with d as (
    delete from public.user_roles
     where user_id = _target_user_id
     returning 1
  )
  select count(*) into deleted_roles from d;

  -- Finally remove the auth user. Owned by postgres via SECURITY DEFINER.
  delete from auth.users where id = _target_user_id;

  return jsonb_build_object(
    'success', true,
    'deleted_user_id', _target_user_id,
    'deleted_agency_members', deleted_members,
    'deleted_user_roles', deleted_roles,
    'was_platform_admin', was_platform_admin
  );
end
$$;

revoke all on function public.system_admin_delete_user(uuid) from public;
grant execute on function public.system_admin_delete_user(uuid) to authenticated;

-- Verify (run as a platform_admin auth context):
-- select public.system_admin_delete_user('00000000-0000-0000-0000-000000000000');
