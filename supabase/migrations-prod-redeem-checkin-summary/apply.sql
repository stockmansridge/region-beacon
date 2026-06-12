-- Extend public.redeem_checkin to return a consumer-facing summary so the
-- check-in result screen can display points earned and venue name without
-- a follow-up query.
--
-- Adds to the return shape (backward-compatible — additive columns):
--   venue_name              text
--   points_awarded          int   (the value just credited; 0 on duplicates)
--   already_checked_in      bool  (true when short-circuited by one-per-venue)
--
-- Existing columns (checkin_id, venue_id, passport_id, is_new) and all
-- behaviour (idempotent ledger insert, rate limit, tenant integrity) are
-- preserved. Safe to re-run.

begin;

create extension if not exists pgcrypto with schema extensions;

drop function if exists public.redeem_checkin(text, text, inet, text);

create or replace function public.redeem_checkin(
  _qr_token text,
  _passport_token text,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  checkin_id uuid,
  venue_id uuid,
  passport_id uuid,
  is_new boolean,
  venue_name text,
  points_awarded int,
  already_checked_in boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
  v_entry_value int;
  v_venue_name text;
begin
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         coalesce(qr.entry_value, 1) as entry_value,
         e.status as event_status,
         v.name as venue_name
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  join public.venues v on v.id = qr.venue_id
  where qr.token = _qr_token and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  v_entry_value := greatest(1, least(coalesce(q.entry_value, 1), 100));
  v_venue_name := q.venue_name;

  select pp.id as passport_id, pp.agency_id, pp.event_id, pp.visitor_id
    into p
  from public.passports pp
  where pp.access_token_hash = extensions.digest(_passport_token::text, 'sha256'::text);

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  select coalesce(es.one_checkin_per_venue, true)         as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0) as min_seconds
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  if s.one_per_venue then
    select c.id into v_existing
    from public.checkins c
    where c.passport_id = p.passport_id and c.venue_id = q.venue_id
    limit 1;

    if v_existing is not null then
      return query select
        v_existing,
        q.venue_id,
        p.passport_id,
        false,
        v_venue_name,
        0,
        true;
      return;
    end if;
  end if;

  if s.min_seconds > 0 then
    select max(c.created_at) into v_last
    from public.checkins c where c.passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  insert into public.checkins (
    agency_id, event_id, passport_id, visitor_id,
    venue_id, venue_qr_code_id, source,
    entry_value, client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.passport_id, p.visitor_id,
    q.venue_id, q.qr_id, 'qr_scan',
    v_entry_value, _client_ip, _user_agent
  )
  returning id into v_checkin;

  if v_entry_value > 0 then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      p.agency_id, p.event_id, p.passport_id,
      'venue', q.venue_id, v_entry_value,
      jsonb_build_object(
        'venue_id', q.venue_id,
        'venue_name', v_venue_name,
        'checkin_id', v_checkin,
        'qr_entry_value', v_entry_value
      )
    )
    on conflict (event_id, participant_id, award_type, source_id)
      where source_id is not null
    do nothing;
  end if;

  return query select
    v_checkin,
    q.venue_id,
    p.passport_id,
    true,
    v_venue_name,
    v_entry_value,
    false;
end;
$$;

grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

commit;
