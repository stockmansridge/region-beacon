-- Fix: only show the venue bonus badge for per-venue bonuses.
-- Event-wide bonuses should NOT flag every venue on the passport home.
--
-- Safe to re-run (create or replace). Apply manually in Supabase SQL editor.

begin;

create or replace function public.get_public_venues_with_bonus(
  _hostname text
)
returns table (
  venue_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return;
  end if;

  return query
    select distinct ebv.venue_id
    from public.event_bonus_code_venues ebv
    join public.event_bonus_codes bc on bc.id = ebv.bonus_code_id
    join public.events e on e.id = bc.event_id
    join public.venues v on v.id = ebv.venue_id
    where bc.event_id = r.event_id
      and bc.scope = 'per_venue'
      and bc.is_active = true
      and ebv.is_active = true
      and e.status = 'published'
      and v.status = 'active'
      and v.deleted_at is null;
end;
$$;

revoke all on function public.get_public_venues_with_bonus(text) from public;
grant execute on function public.get_public_venues_with_bonus(text) to anon, authenticated;

commit;
