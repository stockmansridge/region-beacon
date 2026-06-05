-- 02_get_public_event_faq_by_domain.sql
-- DRAFT ONLY. Do not execute until reviewed.
--
-- Public, privacy-safe FAQ lookup keyed by hostname.
--
-- * Resolves host via public.resolve_event_by_host() — that helper enforces
--   the publishing/billing gate, so FAQ entries for draft / unpublished /
--   inactive events are never returned.
-- * Returns only safe fields: question, answer, order_index.
-- * Never returns id, agency_id, event_id, created_by, or timestamps.
--
-- SECURITY DEFINER with explicit search_path. Direct table reads remain
-- locked down by RLS; this RPC is the sole public surface.

begin;

create or replace function public.get_public_event_faq_by_domain(
  _hostname text
)
returns table (
  question     text,
  answer       text,
  order_index  integer
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
      f.question,
      f.answer,
      f.order_index
    from public.event_faq_entries f
    where f.event_id = r.event_id
    order by f.order_index asc, f.created_at asc;
end;
$$;

grant execute on function public.get_public_event_faq_by_domain(text)
  to anon, authenticated;

commit;

-- Rollback:
--   drop function if exists public.get_public_event_faq_by_domain(text);
