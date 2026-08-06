-- =============================================================================
-- Custom font uploads for event branding.
--
-- Adds:
--   1. Storage bucket `event-fonts` (public read, 2 MB cap, font mime types)
--   2. Table public.event_custom_fonts (family name -> storage path per event)
--   3. Write authorisation helper reused from the event-assets pattern
--   4. RLS: public read (public pages must render the font), writes limited to
--      platform_admin / agency_owner / agency_admin of the owning agency.
--
-- Safe to re-run.
-- =============================================================================

-- 1. Bucket ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-fonts',
  'event-fonts',
  true,
  2 * 1024 * 1024,
  array[
    'font/woff2',
    'font/woff',
    'font/ttf',
    'font/otf',
    'application/font-woff',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Authorisation helper ----------------------------------------------------
create or replace function public.can_write_event_font(_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency uuid;
begin
  if auth.uid() is null or _event_id is null then
    return false;
  end if;

  select agency_id into v_agency
    from public.events
   where id = _event_id
     and deleted_at is null;

  if v_agency is null then
    return false;
  end if;

  if public.has_role(auth.uid(), 'platform_admin'::app_role) then
    return true;
  end if;

  return exists (
    select 1
      from public.agency_members am
     where am.user_id   = auth.uid()
       and am.agency_id = v_agency
       and am.accepted_at is not null
       and am.role in ('agency_owner', 'agency_admin')
  );
end;
$$;

grant execute on function public.can_write_event_font(uuid) to authenticated;

-- Storage path helper: "{agency_id}/{event_id}/font/{filename}"
create or replace function public.can_write_event_font_object(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p text[];
begin
  p := string_to_array(coalesce(_name, ''), '/');
  if array_length(p, 1) is null or array_length(p, 1) < 4 then
    return false;
  end if;
  if p[3] <> 'font' then
    return false;
  end if;
  if p[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_write_event_font(p[2]::uuid);
end;
$$;

grant execute on function public.can_write_event_font_object(text) to authenticated;

-- 3. Table -------------------------------------------------------------------
create table if not exists public.event_custom_fonts (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  family_name   text not null,
  storage_path  text not null,
  file_format   text not null default 'woff2',
  file_size     bigint,
  rights_confirmed boolean not null default false,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create unique index if not exists event_custom_fonts_event_family_uidx
  on public.event_custom_fonts (event_id, lower(family_name));

create index if not exists event_custom_fonts_family_idx
  on public.event_custom_fonts (lower(family_name));

grant select on public.event_custom_fonts to anon;
grant select, insert, update, delete on public.event_custom_fonts to authenticated;
grant all on public.event_custom_fonts to service_role;

alter table public.event_custom_fonts enable row level security;

-- Public read: the public event pages must be able to resolve the @font-face.
drop policy if exists "event_custom_fonts_public_read" on public.event_custom_fonts;
create policy "event_custom_fonts_public_read"
on public.event_custom_fonts
for select
to anon, authenticated
using (true);

drop policy if exists "event_custom_fonts_insert" on public.event_custom_fonts;
create policy "event_custom_fonts_insert"
on public.event_custom_fonts
for insert
to authenticated
with check (public.can_write_event_font(event_id));

drop policy if exists "event_custom_fonts_update" on public.event_custom_fonts;
create policy "event_custom_fonts_update"
on public.event_custom_fonts
for update
to authenticated
using (public.can_write_event_font(event_id))
with check (public.can_write_event_font(event_id));

drop policy if exists "event_custom_fonts_delete" on public.event_custom_fonts;
create policy "event_custom_fonts_delete"
on public.event_custom_fonts
for delete
to authenticated
using (public.can_write_event_font(event_id));

-- 4. Storage RLS -------------------------------------------------------------
drop policy if exists "event_fonts_public_read" on storage.objects;
create policy "event_fonts_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'event-fonts');

drop policy if exists "event_fonts_insert" on storage.objects;
create policy "event_fonts_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'event-fonts' and public.can_write_event_font_object(name));

drop policy if exists "event_fonts_update" on storage.objects;
create policy "event_fonts_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'event-fonts' and public.can_write_event_font_object(name))
with check (bucket_id = 'event-fonts' and public.can_write_event_font_object(name));

drop policy if exists "event_fonts_delete" on storage.objects;
create policy "event_fonts_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'event-fonts' and public.can_write_event_font_object(name));
