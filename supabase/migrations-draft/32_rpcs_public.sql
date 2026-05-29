-- 32_rpcs_public.sql
-- Draft only. Do not execute.
-- Public-facing RPCs. SECURITY DEFINER, explicit search_path, no SELECT *,
-- never return private visitor fields.

-- Host → routing dispatch.
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
  v_evt uuid;
  v_slug citext;
begin
  if v_host = 'easypassport.com.au' then
    return query select 'marketing'::text, null::uuid, null::citext, false;
    return;
  end if;

  if v_host = 'app.easypassport.com.au' then
    return query select 'admin'::text, null::uuid, null::citext, true;
    return;
  end if;

  select e.id, e.public_slug
    into v_evt, v_slug
  from public.event_domains d
  join public.events e on e.id = d.event_id
  where d.status = 'active'
    and e.status = 'published'
    and (
      d.custom_domain = v_host
      or d.public_subdomain = split_part(v_host, '.', 1)
    )
  limit 1;

  if v_evt is null then
    return query select 'not_found'::text, null::uuid, null::citext, false;
  else
    return query select 'event'::text, v_evt, v_slug, false;
  end if;
end;
$$;

-- Public event lookup by globally-unique public_slug (path fallback).
create or replace function public.get_public_event(_public_slug citext)
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
  current_terms_version_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.name, e.public_slug, e.description,
    e.starts_at, e.ends_at, e.timezone,
    b.logo_path, b.cover_path, b.primary_color, b.accent_color,
    b.font_family, b.welcome_copy, b.terms_url,
    e.current_terms_version_id
  from public.events e
  left join public.event_branding b on b.event_id = e.id
  where e.status = 'published'
    and e.public_slug = _public_slug
  limit 1
$$;

create or replace function public.get_public_event_by_domain(_hostname text)
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
  current_terms_version_id uuid
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

  if r.kind <> 'event' then
    return;
  end if;

  return query
    select
      e.id, e.name, e.public_slug, e.description,
      e.starts_at, e.ends_at, e.timezone,
      b.logo_path, b.cover_path, b.primary_color, b.accent_color,
      b.font_family, b.welcome_copy, b.terms_url,
      e.current_terms_version_id
    from public.events e
    left join public.event_branding b on b.event_id = e.id
    where e.id = r.event_id and e.status = 'published';
end;
$$;

create or replace function public.get_public_event_venues(_event_id uuid)
returns table (
  venue_id uuid,
  name text,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  order_index int
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.name, v.address, v.lat, v.lng, v.order_index
  from public.venues v
  join public.events e on e.id = v.event_id
  where e.status = 'published'
    and v.event_id = _event_id
    and v.status = 'active'
    and v.deleted_at is null
  order by v.order_index, v.name
$$;

create or replace function public.get_public_venue_offers(_event_id uuid)
returns table (
  offer_id uuid,
  venue_id uuid,
  title text,
  description text,
  redemption_instructions text,
  offer_type text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.venue_id, o.title, o.description,
    o.redemption_instructions, o.offer_type,
    o.starts_at, o.ends_at
  from public.venue_offers o
  join public.events e on e.id = o.event_id
  where e.status = 'published'
    and o.event_id = _event_id
    and o.is_active = true
    and o.deleted_at is null
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at   is null or o.ends_at   >= now())
$$;

-- Leaderboard: NEVER selects full_name, email, mobile, postcode.
create or replace function public.get_public_leaderboard(_event_id uuid)
returns table (
  display_name text,
  visit_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.leaderboard_settings%rowtype;
begin
  select * into s from public.leaderboard_settings where event_id = _event_id;
  if not found or s.is_enabled = false then
    return;
  end if;

  return query
  with counts as (
    select
      p.id as passport_id,
      p.visitor_id,
      p.leaderboard_opt_out,
      count(c.*)::int as cnt
    from public.passports p
    left join public.checkins c on c.passport_id = p.id
    where p.event_id = _event_id
    group by p.id, p.visitor_id, p.leaderboard_opt_out
  )
  select
    case s.display_mode
      when 'anonymous'               then 'Anonymous'
      when 'alias_only'              then coalesce(v.first_name, 'Guest')
      when 'first_name_only'         then coalesce(v.first_name, 'Guest')
      else                                 -- first_name_last_initial
        coalesce(v.first_name, 'Guest')
        || case
             when s.show_last_initial and v.last_name is not null and length(v.last_name) > 0
               then ' ' || upper(left(v.last_name, 1)) || '.'
             else ''
           end
    end as display_name,
    case when s.show_visit_count then counts.cnt else null end as visit_count
  from counts
  join public.visitors v on v.id = counts.visitor_id
  where counts.cnt >= s.hide_below_checkins
    and (s.allow_visitor_opt_out = false or counts.leaderboard_opt_out = false)
  order by counts.cnt desc, v.first_name asc;
end;
$$;

create or replace function public.validate_public_subdomain(_candidate text)
returns table (ok boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v citext := lower(_candidate);
begin
  if v is null or length(v) < 3 or length(v) > 63 then
    return query select false, 'length'; return;
  end if;
  if not public.is_valid_public_slug(v) then
    return query select false, 'format'; return;
  end if;
  if public.is_reserved_public_slug(v) then
    return query select false, 'reserved'; return;
  end if;
  if exists (select 1 from public.event_domains where public_subdomain = v) then
    return query select false, 'taken'; return;
  end if;
  return query select true, null::text;
end;
$$;

-- EXECUTE grants: public RPCs are intentionally callable by anon AND
-- authenticated; they return only safe projections.
grant execute on function public.resolve_event_by_host(text)            to anon, authenticated;
grant execute on function public.get_public_event(citext)                to anon, authenticated;
grant execute on function public.get_public_event_by_domain(text)        to anon, authenticated;
grant execute on function public.get_public_event_venues(uuid)           to anon, authenticated;
grant execute on function public.get_public_venue_offers(uuid)           to anon, authenticated;
grant execute on function public.get_public_leaderboard(uuid)            to anon, authenticated;
grant execute on function public.validate_public_subdomain(text)         to anon, authenticated;
