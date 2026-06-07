-- System Admin: delete (soft-delete) organisation
--
-- Idempotent SECURITY DEFINER RPC that lets a platform_admin remove an
-- organisation from the System Admin Organisations list.
--
-- SOFT delete: sets agencies.deleted_at = now() (and updated_at). It does
-- NOT touch agencies.status — that column may have a check constraint or
-- enum that does not allow 'deleted', which previously caused the update
-- to fail silently from the UI's perspective.
--
-- The list RPC system_admin_organisations() already filters
-- `where a.deleted_at is null`, so soft-deleted organisations disappear
-- from the platform admin view immediately. Events, venues, passports,
-- check-ins, analytics, billing records, and auth users are NOT touched,
-- so the action is reversible.
--
-- To restore: update public.agencies set deleted_at = null where id = ...;
--
-- Gates:
--   - Caller must satisfy public.is_platform_admin(auth.uid()).
--   - Target agency must exist and not already be deleted.
--
-- Returns: jsonb { success, deleted_agency_id, name, deleted_at }

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
  caller_id    uuid := auth.uid();
  agency_row   public.agencies%rowtype;
  deleted_time timestamptz := now();
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
    raise exception 'Organisation id is required.'
      using errcode = '22023';
  end if;

  select *
    into agency_row
    from public.agencies
   where id = _agency_id;

  if not found then
    raise exception 'Organisation not found.'
      using errcode = 'P0002';
  end if;

  if agency_row.deleted_at is not null then
    raise exception 'Organisation is already deleted.'
      using errcode = '22023';
  end if;

  update public.agencies
     set deleted_at = deleted_time,
         updated_at = deleted_time
   where id = _agency_id;

  return jsonb_build_object(
    'success', true,
    'deleted_agency_id', _agency_id,
    'name', agency_row.name,
    'deleted_at', deleted_time
  );
end
$$;

revoke all on function public.system_admin_delete_organisation(uuid) from public;
grant execute on function public.system_admin_delete_organisation(uuid) to authenticated;

-- Verify after running a delete from the UI:
-- select id, name, slug, status, deleted_at, updated_at
--   from public.agencies
--  where id = '<agency-id>';
-- Expected: deleted_at IS NOT NULL; status unchanged.
