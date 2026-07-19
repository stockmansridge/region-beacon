-- Adds a per-event toggle to require postcode on the public join form,
-- and exposes it to the public site via a small dedicated RPC.

alter table public.events
  add column if not exists require_postcode boolean not null default false;

-- Public RPC: return registration form settings for the event that owns
-- the given hostname (subdomain or custom domain). Read-only, safe for anon.
create or replace function public.get_event_registration_settings(_hostname text)
returns table (
  event_id uuid,
  require_postcode boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id as event_id, coalesce(e.require_postcode, false) as require_postcode
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  where e.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_event_registration_settings(text) to anon, authenticated;
