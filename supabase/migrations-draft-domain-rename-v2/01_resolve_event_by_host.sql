-- DRAFT — do not execute.
--
-- Replaces public.resolve_event_by_host(text) so it recognises ONLY the
-- correct public tenant root `getstampd.com.au`. The earlier typo domain
-- (which was never owned) is not accepted; no dual-suffix fallback.
--
-- Builds on the previously deployed publishing-gate version. The ONLY
-- substantive change is the root/suffix constants. Signature, return type,
-- language, volatility, SECURITY DEFINER, search_path, publishing gate,
-- reserved-label check, custom-domain branch, and grants are all preserved.

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
  v_root constant citext := 'getstampd.com.au';
  v_suffix constant text := '.getstampd.com.au';
  v_label citext;
  v_evt uuid;
  v_slug citext;
begin
  -- Strip an optional :port (Host headers can include one).
  v_host := split_part(v_host::text, ':', 1)::citext;

  -- 1) Apex marketing site.
  if v_host = v_root then
    return query select 'marketing'::text, null::uuid, null::citext, false;
    return;
  end if;

  -- 2) Admin host.
  if v_host = ('app' || v_suffix)::citext then
    return query select 'admin'::text, null::uuid, null::citext, true;
    return;
  end if;

  -- 3) Event subdomain branch — must end with .getstampd.com.au.
  if right(v_host::text, length(v_suffix)) = v_suffix then
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

-- Re-state EXECUTE grants defensively.
grant execute on function public.resolve_event_by_host(text) to anon, authenticated;

commit;
