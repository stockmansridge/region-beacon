-- =============================================================================
-- Draft only — DO NOT execute against production.
-- Apply to STAGING after review.
--
-- Creates the `event-assets` Storage bucket and storage.objects RLS policies
-- to allow agency owners / admins and platform admins to upload event logos
-- and cover images. Public read is enabled for the bucket so the customer
-- landing page (and TrailLanding surfaces) can render the images without an
-- authenticated session.
--
-- Path convention enforced by policies:
--   {agency_id}/{event_id}/logo/{filename}
--   {agency_id}/{event_id}/cover/{filename}
--
-- This migration does NOT modify:
--   - public.event_branding columns (logo_path, cover_path already exist)
--   - public.events
--   - any RPCs
--   - any non-storage RLS policies
-- =============================================================================

-- 1. Create bucket (public read; writes still gated by RLS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-assets',
  'event-assets',
  true,
  5 * 1024 * 1024,                                -- 5 MB hard cap server-side
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Helper: derive (agency_id, event_id, kind) from a storage object name.
--    Object name is stored without the bucket prefix, e.g.
--    "<agency_uuid>/<event_uuid>/logo/<filename>".
create or replace function public.event_assets_path_parts(_name text)
returns table (agency_id uuid, event_id uuid, kind text)
language sql
immutable
as $$
  with parts as (
    select string_to_array(_name, '/') as p
  )
  select
    nullif((p)[1], '')::uuid                                       as agency_id,
    nullif((p)[2], '')::uuid                                       as event_id,
    (p)[3]                                                         as kind
  from parts
  where array_length(p, 1) >= 4
    and (p)[3] in ('logo', 'cover')
$$;

grant execute on function public.event_assets_path_parts(text) to authenticated, anon;

-- 3. Authorisation helper: does the caller have write rights on this event?
--    Allowed: platform_admin OR agency_owner/agency_admin of the owning agency.
--    Explicitly excludes agency_staff.
create or replace function public.can_write_event_asset(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts record;
  v_event_agency uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into parts from public.event_assets_path_parts(_name);
  if parts.agency_id is null or parts.event_id is null then
    return false;
  end if;

  -- Platform admin: unconditional write.
  if public.has_role(auth.uid(), 'platform_admin'::app_role) then
    -- Still require the event to actually belong to the path's agency.
    select agency_id into v_event_agency
      from public.events
     where id = parts.event_id
       and deleted_at is null;
    return v_event_agency is not null and v_event_agency = parts.agency_id;
  end if;

  -- Agency owner/admin: must own the agency AND the event must belong to it.
  if not exists (
    select 1
      from public.agency_members am
     where am.user_id   = auth.uid()
       and am.agency_id = parts.agency_id
       and am.accepted_at is not null
       and am.role in ('agency_owner', 'agency_admin')
  ) then
    return false;
  end if;

  select agency_id into v_event_agency
    from public.events
   where id = parts.event_id
     and deleted_at is null;

  return v_event_agency is not null and v_event_agency = parts.agency_id;
end;
$$;

grant execute on function public.can_write_event_asset(text) to authenticated;

-- 4. storage.objects RLS policies, scoped to bucket_id = 'event-assets'.
--    NOTE: storage.objects already has RLS enabled by Supabase.

-- Public read (bucket is public, but explicit SELECT policy required for RLS).
drop policy if exists "event_assets_public_read" on storage.objects;
create policy "event_assets_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'event-assets');

-- Insert: only owner/admin/platform_admin and only into their own agency/event path.
drop policy if exists "event_assets_insert_write" on storage.objects;
create policy "event_assets_insert_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-assets'
  and public.can_write_event_asset(name)
);

-- Update (replace metadata / overwrite): same gate.
drop policy if exists "event_assets_update_write" on storage.objects;
create policy "event_assets_update_write"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-assets'
  and public.can_write_event_asset(name)
)
with check (
  bucket_id = 'event-assets'
  and public.can_write_event_asset(name)
);

-- Delete: same gate. agency_staff and visitors are blocked.
drop policy if exists "event_assets_delete_write" on storage.objects;
create policy "event_assets_delete_write"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-assets'
  and public.can_write_event_asset(name)
);
