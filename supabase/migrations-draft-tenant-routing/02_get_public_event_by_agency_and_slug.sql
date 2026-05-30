-- DRAFT — NOT APPLIED. See README.md.
--
-- get_public_event_by_agency_and_slug(_sub text, _event_slug text)
--   Returns a single event row matching agencies.slug + events.public_slug,
--   filtered to published events. Mirrors the projection of the existing
--   get_public_event_by_domain RPC so the same client renderer is reusable.
--
-- Safety:
--   - SECURITY DEFINER, STABLE, narrow column projection.
--   - Rejects unpublished events.
--   - Returns nothing if the agency subdomain is reserved or malformed.

create or replace function public.get_public_event_by_agency_and_slug(
  _sub text,
  _event_slug text
)
returns table (
  event_id uuid,
  name text,
  public_slug text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  logo_path text,
  cover_path text,
  primary_color text,
  accent_color text,
  font_family text,
  welcome_copy text,
  terms_url text,
  current_terms_version_id uuid,
  venue_label_singular text,
  venue_label_plural text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sub text := lower(coalesce(_sub, ''));
  slug text := lower(coalesce(_event_slug, ''));
begin
  if sub !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then return; end if;
  if slug = '' then return; end if;
  if sub = any (array[
    'app','admin','api','www','events','support','billing','login','signup',
    'dashboard','system','assets','static','cdn','demo','mail'
  ]) then return; end if;

  return query
    select
      e.id,
      e.name,
      e.public_slug,
      e.description,
      e.starts_at,
      e.ends_at,
      e.timezone,
      e.logo_path,
      e.cover_path,
      e.primary_color,
      e.accent_color,
      e.font_family,
      e.welcome_copy,
      e.terms_url,
      e.current_terms_version_id,
      e.venue_label_singular,
      e.venue_label_plural
    from public.events e
    join public.agencies a on a.id = e.agency_id
    where a.slug = sub
      and e.public_slug = slug
      and coalesce(e.is_published, false) = true
    limit 1;
end
$$;

revoke all on function public.get_public_event_by_agency_and_slug(text, text) from public;
grant execute on function public.get_public_event_by_agency_and_slug(text, text) to anon, authenticated;
