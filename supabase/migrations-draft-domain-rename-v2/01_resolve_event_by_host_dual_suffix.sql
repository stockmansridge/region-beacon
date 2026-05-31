-- DRAFT — do not execute.
--
-- Replaces public.resolve_event_by_host(text) so it accepts the NEW primary
-- root domain `getstampd.com.au` as well as the legacy `getstamped.com.au`
-- suffix that the previously deployed version hard-coded.
--
-- Builds on:
--   * supabase/migrations-draft-domain-rename/02_resolve_event_by_host.sql
--   * supabase/migrations-draft-publishing-gate/01_resolve_event_by_host_publishable.sql
--
-- The ONLY substantive changes vs the publishing-gate version are:
--   1. v_root_new   constant  citext := 'getstampd.com.au';
--   2. v_suffix_new constant  text   := '.getstampd.com.au';
--   3. Apex / admin / event-subdomain branches recognise EITHER suffix.
--
-- Signature, return type, language, volatility, SECURITY DEFINER, search_path,
-- publishing gate, reserved-label check, and custom-domain branch are all
-- preserved unchanged. Grants are re-stated defensively.

begin;

create or replace function public.resolve_event_by_host(_hostname text)
returns table (
  kind text,           -- 'marketing' | 'admin' | 'event' | 'not_found'
  event_id uuid,
  public_slug citext,
  requires_auth boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host citext := lower(_hostname);

  -- New primary public root (customer-facing).
  v_root_new   constant citext := 'getstampd.com.au';
  v_suffix_new constant text   := '.getstampd.com.au';

  -- Legacy root retained temporarily so deploys are not order-sensitive
  -- with the frontend's rpcEventHost() bridge. A follow-up migration will
  -- drop these once rpcEventHost is removed from product code.
  v_root_old   constant citext := 'getstamped.com.au';
  v_suffix_old constant text   := '.getstamped.com.au';

  v_label citext;
  v_evt uuid;
  v_slug citext;
  v_is_event_subdomain boolean := false;
begin
  -- Strip an optional :port (Host headers can include one).
  v_host := split_part(v_host::text, ':', 1)::citext;

  -- 1) Apex marketing site — either root.
  if v_host = v_root_new or v_host = v_root_old then
    return query select 'marketing'::text, null::uuid, null::citext, false;
    return;
  end if;

  -- 2) Admin host — app.<either root>.
  if v_host = ('app' || v_suffix_new)::citext
     or v_host = ('app' || v_suffix_old)::citext then
    return query select 'admin'::text, null::uuid, null::citext, true;
    return;
  end if;

  -- 3) Event subdomain branch — must end with either suffix.
  if right(v_host::text, length(v_suffix_new)) = v_suffix_new then
    v_is_event_subdomain := true;
  elsif right(v_host::text, length(v_suffix_old)) = v_suffix_old then
    v_is_event_subdomain := true;
  end if;

  if v_is_event_subdomain then
    v_label := split_part(v_host::text, '.', 1)::citext;

    -- Reserved labels (admin, www, api, …) never resolve as events.
    if public.is_reserved_public_slug(v_label::text) then
      return query select 'not_found'::text, null::uuid, null::citext, false;
      return;
    end if;

    select e.id, e.public_slug
      into v_evt, v_slug
    from public.event_domains d
    join public.events e on e.id = d.event_id
    where d.status = 'active'
      and d.domain_type = 'event_subdomain'
      and d.public_subdomain = v_label
      and e.status = 'published'
      and public.event_is_publishable(e.id) = true
    limit 1;
  else
    -- 4) Custom domain branch — exact host match only. No arbitrary
    -- first-label fallback for non-GetStampd hostnames.
    select e.id, e.public_slug
      into v_evt, v_slug
    from public.event_domains d
    join public.events e on e.id = d.event_id
    where d.status = 'active'
      and d.domain_type = 'event_custom'
      and d.custom_domain = v_host
      and e.status = 'published'
      and public.event_is_publishable(e.id) = true
    limit 1;
  end if;

  if v_evt is null then
    return query select 'not_found'::text, null::uuid, null::citext, false;
  else
    return query select 'event'::text, v_evt, v_slug, false;
  end if;
end;
$$;

-- Re-state EXECUTE grants. CREATE OR REPLACE preserves them, but restating
-- protects against accidental DROP/CREATE later.
grant execute on function public.resolve_event_by_host(text) to anon, authenticated;

commit;
