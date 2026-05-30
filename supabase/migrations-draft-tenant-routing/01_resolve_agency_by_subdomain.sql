-- DRAFT — NOT APPLIED. See README.md.
--
-- resolve_agency_by_subdomain(_sub text)
--   Returns a single agency row matching agencies.slug = lower(_sub),
--   filtered against the reserved-subdomain list. Empty set on reserved
--   labels, invalid shape, or no match.
--
-- Schema notes (verified against staging):
--   - public.agencies columns: id, name, slug (citext), status (text),
--     billing_email, created_at, updated_at, deleted_at. NO logo_url.
--   - Soft-delete filter: a.deleted_at is null.
--   - We do NOT filter on agencies.status here — the set of "active" status
--     values is not yet known. Add a filter in a follow-up once confirmed.
--
-- Safety:
--   - SECURITY DEFINER so anon can read narrow projection without table grant.
--   - STABLE; no writes. Narrow public-safe projection.

create or replace function public.resolve_agency_by_subdomain(_sub text)
returns table (
  agency_id uuid,
  name text,
  slug text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  sub text := lower(trim(coalesce(_sub, '')));
begin
  -- shape check (mirrors src/lib/reserved-subdomains.ts)
  if sub !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return;
  end if;
  -- reserved labels — keep in sync with the client
  if sub = any (array[
    'app','admin','api','www','events','support','billing','login','signup',
    'dashboard','system','assets','static','cdn','demo','mail'
  ]) then
    return;
  end if;

  return query
    select a.id, a.name, a.slug::text
    from public.agencies a
    where a.slug = sub::citext
      and a.deleted_at is null
    limit 1;
end
$$;

revoke all on function public.resolve_agency_by_subdomain(text) from public;
grant execute on function public.resolve_agency_by_subdomain(text) to anon, authenticated;
