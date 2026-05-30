-- 02_get_public_event_legal_by_domain.sql
-- DRAFT — do not execute automatically.
--
-- Purpose:
--   Provide a single public RPC the customer site can call from
--   /live/$subdomain/terms and /live/$subdomain/privacy. It returns ONLY the
--   safe legal display fields for the event's CURRENT terms version, and
--   never exposes visitor, billing, QR-token, or admin data.
--
-- Behaviour:
--   * Resolves the event via resolve_event_by_host (same gate as the rest of
--     the public surface). Returns zero rows for unknown hosts or events
--     that aren't publishable.
--   * Returns the active row from event_terms_versions
--     (events.current_terms_version_id).
--   * legal_source on the returned row tells the caller whether to render
--     local text or link out to the external URLs.
--
-- Security:
--   SECURITY DEFINER with search_path = public. Granted to anon/authenticated.
--   Does not expose any column outside the safe set listed in RETURNS.

begin;

drop function if exists public.get_public_event_legal_by_domain(text);

create or replace function public.get_public_event_legal_by_domain(_hostname text)
returns table (
  event_id          uuid,
  event_name        text,
  legal_source      text,
  terms_title       text,
  terms_body        text,
  terms_url         text,
  privacy_title     text,
  privacy_body      text,
  privacy_url       text,
  terms_version     text,
  privacy_version   text,
  effective_at      timestamptz
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
    e.id                                                       as event_id,
    e.name                                                     as event_name,
    coalesce(tv.legal_source, e.legal_source, 'external_url')  as legal_source,
    tv.terms_title,
    tv.terms_body,
    tv.terms_url,
    tv.privacy_title,
    tv.privacy_body,
    tv.privacy_url,
    tv.terms_version,
    tv.privacy_version,
    tv.effective_at
  from resolved r
  join public.events e on e.id = r.event_id
  left join public.event_terms_versions tv
    on tv.id = e.current_terms_version_id
   and tv.event_id = e.id
  where e.deleted_at is null;
$$;

grant execute on function public.get_public_event_legal_by_domain(text)
  to anon, authenticated;

commit;
