-- 03_save_event_map.sql
-- DRAFT ONLY. Apply to STAGING after review.
--
-- Admin RPCs to set/clear the event-level uploaded map.
-- Gated by the same permission helpers used by event setup RPCs:
-- platform admin OR agency admin (owner/admin) of the owning agency.

begin;

create or replace function public.save_event_map(
  p_event_id   uuid,
  p_path       text,
  p_mime       text,
  p_filename   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_agency_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_event_id is null then
    raise exception 'Missing event id';
  end if;

  if p_path is null or length(btrim(p_path)) = 0 then
    raise exception 'Missing storage path';
  end if;

  if p_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then
    raise exception 'Unsupported file type: %', p_mime;
  end if;

  select e.agency_id
    into v_agency_id
    from public.events e
   where e.id = p_event_id;

  if v_agency_id is null then
    raise exception 'Event not found';
  end if;

  if not (
    public.is_platform_admin(v_user_id)
    or public.is_agency_admin(v_user_id, v_agency_id)
  ) then
    raise exception 'You do not have permission to manage the map for this event';
  end if;

  insert into public.event_branding (
    agency_id, event_id,
    event_map_path, event_map_file_type, event_map_file_name
  )
  values (
    v_agency_id, p_event_id,
    p_path, p_mime, nullif(btrim(coalesce(p_filename, '')), '')
  )
  on conflict (event_id) do update
    set event_map_path      = excluded.event_map_path,
        event_map_file_type = excluded.event_map_file_type,
        event_map_file_name = excluded.event_map_file_name,
        updated_at          = now();
end;
$$;

revoke all on function public.save_event_map(uuid, text, text, text) from public;
grant execute on function public.save_event_map(uuid, text, text, text) to authenticated;

create or replace function public.clear_event_map(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_agency_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select e.agency_id
    into v_agency_id
    from public.events e
   where e.id = p_event_id;

  if v_agency_id is null then
    raise exception 'Event not found';
  end if;

  if not (
    public.is_platform_admin(v_user_id)
    or public.is_agency_admin(v_user_id, v_agency_id)
  ) then
    raise exception 'You do not have permission to manage the map for this event';
  end if;

  update public.event_branding
     set event_map_path      = null,
         event_map_file_type = null,
         event_map_file_name = null,
         updated_at          = now()
   where event_id = p_event_id;
end;
$$;

revoke all on function public.clear_event_map(uuid) from public;
grant execute on function public.clear_event_map(uuid) to authenticated;

commit;
