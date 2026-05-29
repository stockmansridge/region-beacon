-- 05_helper_event_is_publishable.sql
-- Draft only. Do not execute.
--
-- Helper that combines event lifecycle, domain, and billing state into a
-- single boolean. Future versions of resolve_event_by_host (and any
-- public/edge code that decides whether to serve an event) should call
-- this instead of inspecting events.status directly.
--
-- Returns true when ALL of:
--   1. the event row exists and is not soft-deleted
--   2. events.status = 'published'
--   3. at least one row in event_domains for the event is "live":
--        - is_primary = true  AND status = 'active'  (any domain_type)
--   4. there is an event_activations row whose status is 'active' or 'comp'
--
-- SECURITY DEFINER so it can be called from RLS-restricted contexts (RPCs,
-- policies). search_path pinned to public.

create or replace function public.event_is_publishable(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = _event_id
      and e.deleted_at is null
      and e.status = 'published'
      and exists (
        select 1 from public.event_domains d
        where d.event_id = e.id
          and d.is_primary = true
          and d.status = 'active'
      )
      and exists (
        select 1 from public.event_activations a
        where a.event_id = e.id
          and a.status in ('active','comp')
      )
  )
$$;

-- Intended later use:
--
--   resolve_event_by_host(_host text) will, after looking up a candidate
--   event_domain row, gate the returned event on:
--       public.event_is_publishable(candidate.event_id)
--
--   Public read RPCs (e.g. event_public_branding) will short-circuit and
--   return "not found" when this helper returns false, regardless of the
--   event_domain status. This keeps unpaid / paused events invisible on
--   their reserved subdomain.
--
--   Admin preview routes (/admin/events/$id/preview) DO NOT call this
--   helper — they bypass billing intentionally so admins can review work
--   before activating.
