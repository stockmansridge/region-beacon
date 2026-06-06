-- System Admin: delete (soft-delete) organisation
--
-- Idempotent SECURITY DEFINER RPC that lets a platform_admin remove an
-- organisation from the System Admin Organisations list.
--
-- This is a SOFT delete: it sets agencies.deleted_at = now() and
-- status = 'deleted'. The existing system_admin_organisations() RPC already
-- filters `where deleted_at is null`, so the organisation disappears from
-- the platform admin view immediately. Events, venues, passports, check-ins,
-- analytics, billing records, and auth users are NOT touched, so the action
-- is reversible and safe by default.
--
-- Gates:
--   - Caller must satisfy public.is_platform_admin(auth.uid()).
--   - Target agency must exist and not already be deleted.
--
-- Returns: jsonb { success, deleted_agency_id, name, deleted_at }
-- Raises on failure with a clear errcode/message.

set search_path = public;

create or replace function public.system_admin_delete_organisation(
  _agency_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  agency_row  public.agencies%rowtype;
begin
  if caller_id is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  if not public.is_platform_admin(caller_id) then
    raise exception 'Only platform admins can delete organisations.'
      using errcode = '42501';
  end if;

  if _agency_id is null then
    raise exception 'Agency id is required.'
      using errcode = '22023';
  end if;

  select * into agency_row from public.agencies where id = _agency_id;

  if not found then
    raise exception 'Organisation not found.'
      using errcode = 'P0002';
  end if;

  if agency_row.deleted_at is not null then
    raise exception 'Organisation is already deleted.'
      using errcode = '22023';
  end if;

  update public.agencies
     set deleted_at = now(),
         status = 'deleted',
         updated_at = now()
   where id = _agency_id;

  return jsonb_build_object(
    'success', true,
    'deleted_agency_id', _agency_id,
    'name', agency_row.name,
    'deleted_at', now()
  );
end
$$;

revoke all on function public.system_admin_delete_organisation(uuid) from public;
grant execute on function public.system_admin_delete_organisation(uuid) to authenticated;

-- Verify (run as a platform_admin auth context):
-- select public.system_admin_delete_organisation('00000000-0000-0000-0000-000000000000');
