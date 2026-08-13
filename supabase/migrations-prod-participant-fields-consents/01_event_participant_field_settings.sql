-- 01_event_participant_field_settings.sql
-- GetStampd — event-level participant field settings (Name / Phone / Postcode).
--
-- What this does
--   * adds public.events.require_name and public.events.require_mobile
--   * extends public.get_event_registration_settings(_hostname) so the public
--     join page can read all three settings in one call
--
-- Defaults match what production does TODAY:
--   require_name    = true   (join form has always required a full name)
--   require_mobile  = false  (mobile has always been optional)
--   require_postcode        (already exists, default false — untouched)
--
-- Email is deliberately NOT configurable: it is the canonical participant
-- identity (visitors.email is unique per event) and stays mandatory.
--
-- Additive, idempotent, backward compatible. Apply in the Supabase SQL editor.

begin;

alter table public.events
  add column if not exists require_name boolean not null default true,
  add column if not exists require_mobile boolean not null default false;

comment on column public.events.require_name is
  'When true, the public join form requires a participant name.';
comment on column public.events.require_mobile is
  'When true, the public join form requires a phone number.';

-- Public read of the registration-form settings for the event that owns this
-- hostname. Return type gains columns, so drop first.
drop function if exists public.get_event_registration_settings(text);

create or replace function public.get_event_registration_settings(_hostname text)
returns table (
  event_id uuid,
  require_name boolean,
  require_mobile boolean,
  require_postcode boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id                                  as event_id,
    coalesce(e.require_name, true)        as require_name,
    coalesce(e.require_mobile, false)     as require_mobile,
    coalesce(e.require_postcode, false)   as require_postcode
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  where e.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_event_registration_settings(text) from public;
grant execute on function public.get_event_registration_settings(text)
  to anon, authenticated, service_role;

commit;

-- Verification
--   select * from public.get_event_registration_settings('<subdomain>.getstampd.com.au');
