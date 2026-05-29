-- 01_get_passport_stamps_by_token.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Adds a privacy-safe RPC that powers the visitor passport page
-- (/passport/$token). Returns the stamped + unstamped venue list for the
-- passport identified by the raw access token. The caller proves ownership
-- by knowing the raw token (same trust model as get_passport_by_token).
--
-- SECURITY:
--   * SECURITY DEFINER, explicit search_path = public
--   * Resolves passport via SHA-256(access_token); zero rows on bad token
--   * Only returns public venue fields + this passport's own checked_in_at
--   * NEVER returns: QR tokens, other visitors' data, admin/billing fields,
--     email/PII of other passports, raw access tokens
--
-- Depends on:
--   * public.passports (access_token_hash)
--   * public.checkins  (passport_id, venue_id, created_at)
--   * public.venues    (+ logo_path/cover_path from
--                       migrations-draft-venue-public-pages/01)
--   * public.event_branding (venue_label_singular/plural — optional)
--   * pgcrypto digest()

begin;

create or replace function public.get_passport_stamps_by_token(
  _raw_token text
)
returns table (
  passport_id           uuid,
  event_id              uuid,
  event_name            text,
  venue_label_singular  text,
  venue_label_plural    text,
  total_venues          int,
  stamped_count         int,
  venue_id              uuid,
  venue_name            text,
  venue_logo_path       text,
  venue_cover_path      text,
  order_index           int,
  is_stamped            boolean,
  checked_in_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  v_total int;
  v_stamped int;
  v_event_name text;
  v_label_sing text;
  v_label_plur text;
begin
  if _raw_token is null or length(_raw_token) < 8 then
    return;
  end if;

  select pp.id, pp.event_id
    into p
  from public.passports pp
  where pp.access_token_hash = digest(_raw_token, 'sha256')
  limit 1;

  if p.id is null then
    return;
  end if;

  select e.name into v_event_name
  from public.events e
  where e.id = p.event_id and e.deleted_at is null
  limit 1;

  select
    coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue'),
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues')
    into v_label_sing, v_label_plur
  from public.event_branding b
  where b.event_id = p.event_id
  limit 1;

  if v_label_sing is null then v_label_sing := 'Venue'; end if;
  if v_label_plur is null then v_label_plur := 'Venues'; end if;

  select count(*)::int into v_total
  from public.venues v
  where v.event_id = p.event_id
    and v.status = 'active'
    and v.deleted_at is null;

  select count(distinct c.venue_id)::int into v_stamped
  from public.checkins c
  join public.venues v
    on v.id = c.venue_id
   and v.event_id = p.event_id
   and v.status = 'active'
   and v.deleted_at is null
  where c.passport_id = p.id;

  return query
    with first_checkin as (
      select c.venue_id, min(c.created_at) as first_at
      from public.checkins c
      where c.passport_id = p.id
      group by c.venue_id
    )
    select
      p.id                                as passport_id,
      p.event_id                          as event_id,
      v_event_name                        as event_name,
      v_label_sing                        as venue_label_singular,
      v_label_plur                        as venue_label_plural,
      v_total                             as total_venues,
      v_stamped                           as stamped_count,
      v.id                                as venue_id,
      v.name                              as venue_name,
      v.logo_path                         as venue_logo_path,
      v.cover_path                        as venue_cover_path,
      v.order_index                       as order_index,
      (fc.first_at is not null)           as is_stamped,
      fc.first_at                         as checked_in_at
    from public.venues v
    left join first_checkin fc on fc.venue_id = v.id
    where v.event_id = p.event_id
      and v.status = 'active'
      and v.deleted_at is null
    order by
      (fc.first_at is null),       -- stamped first
      fc.first_at asc nulls last,  -- earliest stamp first
      v.order_index nulls last,
      v.name;
end;
$$;

grant execute on function public.get_passport_stamps_by_token(text)
  to anon, authenticated;

commit;
