-- 02_get_public_event_announcements_by_domain.sql
-- DRAFT ONLY. Do not execute.
--
-- Public, privacy-safe announcement lookup keyed by hostname.
--
-- * Resolves host via public.resolve_event_by_host() — that helper already
--   enforces the publishing/billing gate (see publishing-gate draft), so
--   announcements for draft / unpublished / inactive events are never
--   returned.
-- * Returns only currently-active announcements within the optional
--   starts_at/ends_at window.
-- * Returns ONLY safe fields: title, message, tone, link_label, link_url.
--   Never returns id, agency_id, event_id, created_by, timestamps, or
--   is_active toggle state.
--
-- SECURITY DEFINER with explicit search_path. Direct table reads remain
-- locked down by RLS; this RPC is the sole public surface.

begin;

create or replace function public.get_public_event_announcements_by_domain(
  _hostname text
)
returns table (
  title        text,
  message      text,
  tone         text,
  link_label   text,
  link_url     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return;
  end if;

  return query
    select
      a.title,
      a.message,
      a.tone,
      a.link_label,
      a.link_url
    from public.event_announcements a
    where a.event_id = r.event_id
      and a.is_active = true
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at   is null or a.ends_at   >= now())
    order by
      case a.tone
        when 'urgent'  then 0
        when 'warning' then 1
        when 'success' then 2
        else                3
      end,
      a.updated_at desc;
end;
$$;

grant execute on function public.get_public_event_announcements_by_domain(text)
  to anon, authenticated;

commit;

-- Rollback:
--   drop function if exists public.get_public_event_announcements_by_domain(text);
