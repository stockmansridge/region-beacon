-- Admin read RPC for event FAQ entries.
-- Mirrors the permission gate used by save_event_faq_entries:
-- platform admin OR public.is_agency_admin(...) for the event's agency.

create or replace function public.get_event_faq_entries(p_event_id uuid)
returns setof public.event_faq_entries
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_agency_id uuid;
  v_is_platform_admin boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select agency_id into v_agency_id
  from public.events
  where id = p_event_id;

  if v_agency_id is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  begin
    select public.has_role(v_user_id, 'platform_admin'::public.app_role)
      into v_is_platform_admin;
  exception when others then
    v_is_platform_admin := false;
  end;

  if not (v_is_platform_admin or public.is_agency_admin(v_agency_id)) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
    select *
    from public.event_faq_entries
    where event_id = p_event_id
    order by order_index asc, created_at asc;
end;
$$;

revoke all on function public.get_event_faq_entries(uuid) from public;
grant execute on function public.get_event_faq_entries(uuid) to authenticated;
