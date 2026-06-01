-- 02_extend_get_public_event_by_domain_page_background_key.sql
-- DRAFT ONLY. Do not execute against production without approval.
--
-- Purpose:
--   Follow-up to the already-applied palette RPC
--   (supabase/migrations-draft-event-palette/02_extend_get_public_event_by_domain_palette_key.sql).
--   Extends public.get_public_event_by_domain(_hostname text) so the
--   anonymous public event RPC also surfaces
--   event_branding.page_background_key. Without this, visitors' browsers
--   cannot read the selected background and every public page falls back
--   to "clean_light".
--
-- Changes to the existing return shape:
--   - adds `page_background_key text` at the END (nullable). All other
--     columns keep their order/type, so existing client destructuring by
--     column name remains compatible.
--
-- Preserved (verbatim from the previous version of this function):
--   - SECURITY DEFINER
--   - set search_path = public
--   - publish-gate behaviour (only event rows resolvable via
--     resolve_event_by_host with kind='event' are returned;
--     deleted_at filter retained)
--   - grants to anon, authenticated
--   - No new PII, no admin-only fields exposed.
--
--   - Drop+create required because RETURNS TABLE signature changes.

begin;

drop function if exists public.get_public_event_by_domain(text);

create or replace function public.get_public_event_by_domain(_hostname text)
returns table (
  event_id                  uuid,
  name                      text,
  public_slug               text,
  description               text,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  timezone                  text,
  logo_path                 text,
  cover_path                text,
  primary_color             text,
  accent_color              text,
  font_family               text,
  welcome_copy              text,
  terms_url                 text,
  current_terms_version_id  uuid,
  venue_label_singular      text,
  venue_label_plural        text,
  palette_key               text,
  page_background_key       text
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved as (
    select r.event_id
    from public.resolve_event_by_host(_hostname) r
    where r.kind = 'event' and r.event_id is not null
    limit 1
  )
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
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues') as venue_label_plural,
    b.palette_key                     as palette_key,
    b.page_background_key             as page_background_key
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where e.deleted_at is null;
$$;

grant execute on function public.get_public_event_by_domain(text) to anon, authenticated;

commit;

-- Rollback: re-apply
--   supabase/migrations-draft-event-palette/02_extend_get_public_event_by_domain_palette_key.sql
