-- =====================================================================
-- TENANT ROUTING — PRODUCTION APPLY BUNDLE
-- =====================================================================
-- Source of truth: byte-identical to the patched staging files in
-- supabase/migrations-draft-tenant-routing/
--   - 01_resolve_agency_by_subdomain.sql
--   - 02_get_public_event_by_agency_and_slug.sql   (PATCHED — evt_slug)
--   - 03_agencies_slug_check.sql
--
-- DO NOT run this whole file as one block. Apply in the order defined by
-- PRODUCTION_CUTOVER_CHECKLIST.md §3:
--
--   1. Run BLOCK 01.        Then run verify check 1 from 04_verify.sql.
--   2. Run BLOCK 02.        Then run verify check 2 from 04_verify.sql.
--   3. Run preflight 2a (slug audit) from the checklist. If 0 rows, run
--      BLOCK 03. If >0 rows, SKIP BLOCK 03 and report.
--   4. Run verify checks 3–6 from 04_verify.sql against real prod slugs.
--
-- Safety properties of this bundle:
--   - No CREATE TABLE, no ALTER TABLE ... ADD COLUMN, no DROP.
--   - No grants beyond `EXECUTE` on the two new RPCs to anon + authenticated.
--   - No RLS changes. No event_domains changes. No /live route changes.
--   - 03 is NOT VALID, so it cannot fail on existing rows; it only constrains
--     new INSERT/UPDATE traffic. Do NOT VALIDATE in this cutover.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCK 01 — resolve_agency_by_subdomain
-- ---------------------------------------------------------------------
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
  if sub !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return;
  end if;
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


-- ---------------------------------------------------------------------
-- BLOCK 02 — get_public_event_by_agency_and_slug   (PATCHED)
-- Local variable renamed `slug` -> `evt_slug` to avoid collision with
-- agencies.slug (staging error 42702). This is the version that passed
-- staging verify check 6 against ready-marketing / orange-wine-festival-test.
-- ---------------------------------------------------------------------
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
  sub      text := lower(trim(coalesce(_sub, '')));
  evt_slug text := lower(trim(coalesce(_event_slug, '')));
begin
  if sub !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then return; end if;
  if evt_slug = '' then return; end if;
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
      and e.public_slug = evt_slug::citext
      and e.status = 'published'
      and e.deleted_at is null
      and public.event_is_publishable(e.id) = true
    limit 1;
end
$$;

revoke all on function public.get_public_event_by_agency_and_slug(text, text) from public;
grant execute on function public.get_public_event_by_agency_and_slug(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- BLOCK 03 — agencies_slug_public_subdomain_check    (GATED)
-- Run ONLY if the preflight slug audit (PRODUCTION_CUTOVER_CHECKLIST §2a)
-- returns 0 rows. NOT VALID — existing rows are not re-checked. A separate
-- later step may run:
--   alter table public.agencies validate constraint agencies_slug_public_subdomain_check;
-- That VALIDATE step is OUT OF SCOPE for this cutover.
-- ---------------------------------------------------------------------
alter table public.agencies
  add constraint agencies_slug_public_subdomain_check
  check (
    slug is null
    or (
      slug::text = lower(slug::text)
      and slug::text ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      and lower(slug::text) not in (
        'app','admin','api','www','events','support','billing',
        'login','signup','dashboard','system','assets','static',
        'cdn','demo','mail'
      )
    )
  ) not valid;
