-- DRAFT — NOT APPLIED. See README.md.
--
-- get_public_event_by_agency_and_slug(_sub text, _event_slug text)
--   Returns a single event row matching agencies.slug + events.public_slug,
--   using the same public-event eligibility rule as
--   public.get_public_event_by_domain / public.resolve_event_by_host:
--
--     e.status = 'published'
--     and e.deleted_at is null
--     and public.event_is_publishable(e.id) = true
--
--   Projection mirrors get_public_event_by_domain (17 columns) so the same
--   client renderer is reusable. Branding columns come from
--   public.event_branding (LEFT JOIN). Venue labels use the same
--   coalesce(nullif(btrim(...), ''), default) pattern.
--
-- Schema notes (verified against staging):
--   - events.public_slug is citext.
--   - agencies.slug is citext.
--   - events has status + deleted_at. NO is_published column.
--
-- Safety:
--   - SECURITY DEFINER, STABLE, narrow public projection.
--   - Returns nothing if subdomain is reserved/malformed or event slug empty.

create or replace function public.get_public_event_by_agency_and_slug(
  _sub text,
  _event_slug text
)
returns table (
  event_id uuid,
  name text,
  public_slug citext,
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
set search_path = public, pg_temp
as $$
declare
  sub  text := lower(trim(coalesce(_sub, '')));
  slug text := lower(trim(coalesce(_event_slug, '')));
begin
  if sub !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then return; end if;
  if slug = '' then return; end if;
  if sub = any (array[
    'app','admin','api','www','events','support','billing','login','signup',
    'dashboard','system','assets','static','cdn','demo','mail'
  ]) then return; end if;

  return query
    select
      e.id                              as event_id,
      e.name,
      e.public_slug,
      e.description,
      e.starts_at,
      e.ends_at,
      e.timezone,
      b.logo_path,
      b.cover_path,
      b.primary_color,
      b.accent_color,
      b.font_family,
      b.welcome_copy,
      b.terms_url,
      e.current_terms_version_id,
      coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue')  as venue_label_singular,
      coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues') as venue_label_plural
    from public.events e
    join public.agencies a       on a.id = e.agency_id
    left join public.event_branding b on b.event_id = e.id
    where a.slug = sub::citext
      and a.deleted_at is null
      and e.public_slug = slug::citext
      and e.status = 'published'
      and e.deleted_at is null
      and public.event_is_publishable(e.id) = true
    limit 1;
end
$$;

revoke all on function public.get_public_event_by_agency_and_slug(text, text) from public;
grant execute on function public.get_public_event_by_agency_and_slug(text, text) to anon, authenticated;
