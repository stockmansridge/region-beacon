-- DRAFT — NOT APPLIED. See README.md.
--
-- resolve_agency_by_subdomain(_sub text)
--   Returns a single agency row matching agencies.slug = lower(_sub),
--   filtered against the reserved-subdomain list. Empty set on reserved
--   labels, invalid shape, or no match.
--
-- Safety:
--   - SECURITY DEFINER so the function can read agencies without granting
--     anon SELECT on the table directly.
--   - STABLE; no writes.
--   - Projects only public-safe columns.

create or replace function public.resolve_agency_by_subdomain(_sub text)
returns table (
  agency_id uuid,
  name text,
  slug text,
  logo_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sub text := lower(coalesce(_sub, ''));
begin
  -- shape check (mirrors src/lib/reserved-subdomains.ts)
  if sub !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return;
  end if;
  -- reserved labels — keep this list in sync with the client
  if sub = any (array[
    'app','admin','api','www','events','support','billing','login','signup',
    'dashboard','system','assets','static','cdn','demo','mail'
  ]) then
    return;
  end if;

  return query
    select a.id, a.name, a.slug, a.logo_url
    from public.agencies a
    where a.slug = sub
    limit 1;
end
$$;

revoke all on function public.resolve_agency_by_subdomain(text) from public;
grant execute on function public.resolve_agency_by_subdomain(text) to anon, authenticated;
