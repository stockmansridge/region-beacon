-- 08_fix_awards_storage_policy.sql — DRAFT only.
--
-- Fixes Awards image uploads into the existing `event-assets` bucket.
--
-- Root cause addressed:
--   Awards migration 03 replaced public.event_assets_path_parts(text) with a
--   3-column helper that accepted logo/cover/awards, but some environments
--   already had later event-asset support such as map and/or venue assets.
--   In those environments public.can_write_event_asset(text) can either keep
--   rejecting awards/map paths or raise inside Storage RLS because helper
--   shapes no longer match.
--
-- Final event-level folders accepted here:
--   {agency_id}/{event_id}/logo/{filename}
--   {agency_id}/{event_id}/cover/{filename}
--   {agency_id}/{event_id}/map/{filename}
--   {agency_id}/{event_id}/awards/{filename}
--
-- Existing venue-level public-page asset folders are preserved:
--   {agency_id}/{event_id}/venues/{venue_id}/logo/{filename}
--   {agency_id}/{event_id}/venues/{venue_id}/cover/{filename}
--
-- This migration does NOT alter storage.buckets. Existing bucket MIME/type and
-- file-size settings remain unchanged.

begin;

-- The storage.objects policies depend on public.can_write_event_asset(text),
-- so drop/recreate them inside this transaction before replacing helpers.
drop policy if exists "event_assets_public_read" on storage.objects;
drop policy if exists "event_assets_insert_write" on storage.objects;
drop policy if exists "event_assets_update_write" on storage.objects;
drop policy if exists "event_assets_delete_write" on storage.objects;

drop function if exists public.can_write_event_asset(text);
drop function if exists public.event_assets_path_parts(text);

-- Path parser: supports event-level logo/cover/map/awards and the existing
-- venue-level logo/cover shape. Returning venue_id keeps compatibility with
-- the venue public-page storage migration.
create function public.event_assets_path_parts(_name text)
returns table (
  agency_id uuid,
  event_id  uuid,
  kind      text,
  venue_id  uuid
)
language sql
immutable
as $$
  with parts as (
    select string_to_array(coalesce(_name, ''), '/') as p
  ),
  shaped as (
    select
      p,
      array_length(p, 1) as n,
      (p)[1] as s1,
      (p)[2] as s2,
      (p)[3] as s3,
      (p)[4] as s4,
      (p)[5] as s5,
      (p)[6] as s6
    from parts
  ),
  event_level as (
    select
      (s1)::uuid as agency_id,
      (s2)::uuid as event_id,
      s3         as kind,
      null::uuid as venue_id
    from shaped
    where n >= 4
      and s3 in ('logo', 'cover', 'map', 'awards')
      and s4 is not null
      and length(s4) > 0
      and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  venue_level as (
    select
      (s1)::uuid as agency_id,
      (s2)::uuid as event_id,
      s5         as kind,
      (s4)::uuid as venue_id
    from shaped
    where n >= 6
      and s3 = 'venues'
      and s5 in ('logo', 'cover')
      and s6 is not null
      and length(s6) > 0
      and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s4 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select * from event_level
  union all
  select * from venue_level
$$;

grant execute on function public.event_assets_path_parts(text)
  to authenticated, anon;

-- Write gate used by the storage.objects policies. This preserves the same
-- permission rule as the original event-assets uploader: platform_admin OR
-- agency_owner/agency_admin for the owning agency, and the event in the path
-- must belong to that agency. Venue-level paths also validate the venue.
create function public.can_write_event_asset(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts record;
  v_event_agency uuid;
  v_venue_event  uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into parts from public.event_assets_path_parts(_name);
  if parts.agency_id is null or parts.event_id is null then
    return false;
  end if;

  select agency_id into v_event_agency
    from public.events
   where id = parts.event_id
     and deleted_at is null;

  if v_event_agency is null or v_event_agency <> parts.agency_id then
    return false;
  end if;

  if parts.venue_id is not null then
    select event_id into v_venue_event
      from public.venues
     where id = parts.venue_id
       and deleted_at is null;

    if v_venue_event is null or v_venue_event <> parts.event_id then
      return false;
    end if;
  end if;

  if public.has_role(auth.uid(), 'platform_admin'::app_role) then
    return true;
  end if;

  return exists (
    select 1
      from public.agency_members am
     where am.user_id = auth.uid()
       and am.agency_id = parts.agency_id
       and am.accepted_at is not null
       and am.role in ('agency_owner', 'agency_admin')
  );
end;
$$;

grant execute on function public.can_write_event_asset(text) to authenticated;

-- Restore storage.objects policies so all writes go through the fixed helper.
create policy "event_assets_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'event-assets');

create policy "event_assets_insert_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-assets'
  and public.can_write_event_asset(name)
);

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

create policy "event_assets_delete_write"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-assets'
  and public.can_write_event_asset(name)
);

commit;

-- Verification queries — run after applying the migration.

-- 1) Awards path parses successfully and returns kind = 'awards'.
select *
from public.event_assets_path_parts(
  '8f7770f5-892b-4583-83b5-e946ab84ddf3/41ebf116-6e70-428f-8dcb-bda56f73fb8a/awards/test.png'
);

-- 2) Existing event-level folders still parse.
select kind
from public.event_assets_path_parts(
  '8f7770f5-892b-4583-83b5-e946ab84ddf3/41ebf116-6e70-428f-8dcb-bda56f73fb8a/logo/test.png'
)
union all
select kind
from public.event_assets_path_parts(
  '8f7770f5-892b-4583-83b5-e946ab84ddf3/41ebf116-6e70-428f-8dcb-bda56f73fb8a/cover/test.jpg'
)
union all
select kind
from public.event_assets_path_parts(
  '8f7770f5-892b-4583-83b5-e946ab84ddf3/41ebf116-6e70-428f-8dcb-bda56f73fb8a/map/test.webp'
);

-- 3) No-auth check: this should return false, not raise an error. A false
--    result here means the awards folder parses and only auth is missing.
select public.can_write_event_asset(
  '8f7770f5-892b-4583-83b5-e946ab84ddf3/41ebf116-6e70-428f-8dcb-bda56f73fb8a/awards/test.png'
) as awards_write_without_auth_returns_false_not_error;

-- 4) Optional admin-context check. Run this in SQL editor after replacing
--    <admin_user_uuid> with an agency_owner/agency_admin user for the event.
-- select set_config('request.jwt.claim.sub', '<admin_user_uuid>', true);
-- select public.can_write_event_asset(
--   '8f7770f5-892b-4583-83b5-e946ab84ddf3/41ebf116-6e70-428f-8dcb-bda56f73fb8a/awards/test.png'
-- ) as awards_write_for_admin_should_be_true;

-- 5) Confirm the event-assets policies are present and still helper-gated.
select polname, polcmd
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname like 'event_assets_%'
order by polname;