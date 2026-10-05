-- REVIEW ONLY. Run after 01_event_branding_style_overrides.sql.
-- Small companion RPCs avoid changing the deployed wide event RPC signatures.

begin;

create or replace function public.get_public_event_style_overrides(_hostname text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select b.style_overrides
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where r.kind = 'event'
    and r.event_id is not null
    and e.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_public_event_style_overrides(text) from public;
grant execute on function public.get_public_event_style_overrides(text) to anon, authenticated;

create or replace function public.get_public_event_style_overrides_by_agency_and_slug(
  _sub text,
  _event_slug text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select b.style_overrides
  from public.agencies a
  join public.events e on e.agency_id = a.id
  left join public.event_branding b on b.event_id = e.id
  where lower(a.public_subdomain) = lower(trim(_sub))
    and lower(e.public_slug) = lower(trim(_event_slug))
    and e.deleted_at is null
    and public.event_is_publishable(e.id)
  limit 1;
$$;

revoke all on function public.get_public_event_style_overrides_by_agency_and_slug(text, text) from public;
grant execute on function public.get_public_event_style_overrides_by_agency_and_slug(text, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Rollback:
-- drop function if exists public.get_public_event_style_overrides(text);
-- drop function if exists public.get_public_event_style_overrides_by_agency_and_slug(text, text);