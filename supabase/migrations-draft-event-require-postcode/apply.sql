-- migrations-draft-event-require-postcode/apply.sql
--
-- Adds an event-level toggle that makes the "Postcode" field on the public
-- join / registration form mandatory. Also exposes a small public RPC so the
-- public join page can read the flag without touching the events table
-- directly (which is protected by RLS).
--
-- Apply in the Supabase SQL editor.

-- 1. Column on events. Defaults to false so behaviour is unchanged for
--    existing events until an organiser opts in.
alter table public.events
  add column if not exists require_postcode boolean not null default false;

comment on column public.events.require_postcode is
  'When true, the postcode field on the public join form is mandatory.';

-- 2. Tiny public RPC — returns just the registration-form settings for the
--    event that owns the given hostname. Kept intentionally narrow so we
--    don''t need to touch the big get_public_event_by_domain RPC.
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
  select e.id as event_id,
         coalesce(e.require_postcode, false) as require_postcode
  from public.event_domains d
  join public.events e on e.id = d.event_id
  where d.status = 'active'
    and e.deleted_at is null
    and (
      lower(d.custom_domain) = lower(_hostname)
      or lower(d.public_subdomain || '.' || split_part(_hostname, '.', 2) || '.' || split_part(_hostname, '.', 3)) = lower(_hostname)
      or lower(d.public_subdomain) = lower(split_part(_hostname, '.', 1))
    )
  limit 1
$$;

revoke all on function public.get_event_registration_settings(text) from public;
grant execute on function public.get_event_registration_settings(text) to anon, authenticated;
