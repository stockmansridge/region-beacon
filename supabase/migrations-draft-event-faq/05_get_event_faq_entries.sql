-- Admin read RPC for event FAQ entries.
-- Mirrors the permission gate used by save_event_faq_entries:
-- platform admin OR agency admin for the event's agency.

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
    raise exception 'You do not have permission to read FAQ entries for this event';
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
