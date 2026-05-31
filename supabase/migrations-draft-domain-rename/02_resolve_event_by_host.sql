-- DRAFT — do not execute.
-- Replaces public.resolve_event_by_host so its hardcoded host constants point
-- at getstampd.com.au instead of easypassport.com.au.
--
-- Identical signature, return type, language, volatility, security mode, and
-- search_path as the version in supabase/migrations-draft/32_rpcs_public.sql.
-- The ONLY substantive change is the three host literals (root, suffix, admin
-- host derived from 'app' || suffix).
--
-- Does NOT add billing/activation checks. event_is_publishable will be wired
-- in a separate controlled step.

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
  -- Strip an optional :port (defensive — Host headers can include one).
  v_host := split_part(v_host::text, ':', 1)::citext;

  -- Apex marketing site.
  if v_host = v_root then
    return query select 'marketing'::text, null::uuid, null::citext, false;
    return;
  end if;

  -- Admin host.
  if v_host = ('app' || v_suffix)::citext then
    return query select 'admin'::text, null::uuid, null::citext, true;
    return;
  end if;

  -- Event subdomain: ONLY when host ends with .getstampd.com.au and the
  -- first label is not a reserved name.
  if right(v_host::text, length(v_suffix)) = v_suffix then
    v_label := split_part(v_host::text, '.', 1)::citext;

    if public.is_reserved_public_slug(v_label::text) then
      return query select 'not_found'::text, null::uuid, null::citext, false;
      return;
    end if;

    select e.id, e.public_slug
      into v_evt, v_slug
    from public.event_domains d
    join public.events e on e.id = d.event_id
    where d.status = 'active'
      and e.status = 'published'
      and d.domain_type = 'event_subdomain'
      and d.public_subdomain = v_label
    limit 1;
  else
    -- Custom domain: exact host match only. No first-label fallback for
    -- arbitrary non-GetStampd hostnames.
    select e.id, e.public_slug
      into v_evt, v_slug
    from public.event_domains d
    join public.events e on e.id = d.event_id
    where d.status = 'active'
      and e.status = 'published'
      and d.domain_type = 'event_custom'
      and d.custom_domain = v_host
    limit 1;
  end if;

  if v_evt is null then
    return query select 'not_found'::text, null::uuid, null::citext, false;
  else
    return query select 'event'::text, v_evt, v_slug, false;
  end if;
end;
$$;

-- Preserve EXECUTE grants (CREATE OR REPLACE keeps them, but re-stating is
-- harmless and protects against accidental DROP/CREATE in the future).
grant execute on function public.resolve_event_by_host(text) to anon, authenticated;

commit;
