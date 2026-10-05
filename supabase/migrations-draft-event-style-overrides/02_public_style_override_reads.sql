-- REVIEW ONLY. Run after 01_event_branding_style_overrides.sql.
-- Narrow reads preserve deployed wide RPC signatures and expose only the
-- branding for the one publishable event resolved by the requested host.

begin;

create or replace function public.get_public_event_v2_branding(_hostname text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'public_template_version', case when b.public_template_version = 'v2' then 'v2' else 'v1' end,
    'v2_style_config', case when b.public_template_version = 'v2' then b.v2_style_config else null end
  )
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id and b.agency_id = e.agency_id
  where r.kind = 'event' and r.event_id is not null and e.deleted_at is null
    and public.event_is_publishable(e.id)
  limit 1;
$$;

create or replace function public.get_public_event_v2_branding_by_agency_and_slug(_sub text, _event_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'public_template_version', case when b.public_template_version = 'v2' then 'v2' else 'v1' end,
    'v2_style_config', case when b.public_template_version = 'v2' then b.v2_style_config else null end
  )
  from public.event_domains d
  join public.events e on e.id = d.event_id
  left join public.event_branding b on b.event_id = e.id and b.agency_id = e.agency_id
  where d.domain_type = 'event_subdomain'
    and lower(d.public_subdomain) = lower(trim(_sub))
    and lower(e.public_slug) = lower(trim(_event_slug))
    and e.deleted_at is null and public.event_is_publishable(e.id)
  limit 1;
$$;

revoke all on function public.get_public_event_v2_branding(text) from public;
revoke all on function public.get_public_event_v2_branding_by_agency_and_slug(text, text) from public;
grant execute on function public.get_public_event_v2_branding(text) to anon, authenticated;
grant execute on function public.get_public_event_v2_branding_by_agency_and_slug(text, text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';

-- Rollback:
-- drop function if exists public.get_public_event_v2_branding(text);
-- drop function if exists public.get_public_event_v2_branding_by_agency_and_slug(text, text);