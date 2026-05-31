-- DRAFT — do not execute until approved.
--
-- Fix: redeem_checkin fails with
--   SQLSTATE 42702: column reference "passport_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- Root cause: the function declares
--   RETURNS TABLE (checkin_id uuid, venue_id uuid, passport_id uuid, is_new boolean)
-- which creates implicit OUT parameters named `passport_id` and `venue_id`.
-- Inside the body, unqualified references such as
--   from public.checkins where passport_id = p.passport_id and venue_id = q.venue_id
-- are ambiguous between the OUT parameter and the table column on `checkins`.
--
-- This migration ONLY replaces public.redeem_checkin to disambiguate by:
--   * aliasing every table reference (c, p2, ...);
--   * fully qualifying every column on checkins / passports / venue_qr_codes;
--   * renaming the local passport record's exposed field via `as v_passport_id`
--     so we never read `p.passport_id` (which collides with the OUT name).
--
-- Preserved exactly:
--   * function signature (text, text, inet, text)
--   * RETURNS TABLE shape (checkin_id, venue_id, passport_id, is_new)
--   * SECURITY DEFINER
--   * search_path = public
--   * EXECUTE grants to anon, authenticated
--   * pgcrypto fix (extensions.digest(_passport_token, 'sha256'))
--   * all validation gates: qr_invalid, event_not_available, passport_not_found,
--     passport_event_mismatch, one-per-venue dedupe, min-gap rate_limited, is_new
--
-- NOTE: This body matches migrations-draft-passport-stamps/02 (no entry_value
-- snapshot). If the rewards-prize-draw `entry_value` migration has been
-- applied to production, DO NOT apply this file — request an entry_value-aware
-- variant first, otherwise this would silently stop snapshotting entry_value
-- onto new checkins rows.

begin;

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
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
begin
  -- 1) Resolve QR.
  select qr.id           as qr_id,
         qr.venue_id     as qr_venue_id,
         qr.event_id     as qr_event_id,
         qr.agency_id    as qr_agency_id,
         e.status        as event_status
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  where qr.token = _qr_token
    and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  -- 2) Resolve passport by hashed token.
  select p2.id          as v_passport_id,
         p2.agency_id   as v_agency_id,
         p2.event_id    as v_event_id,
         p2.visitor_id  as v_visitor_id
    into p
  from public.passports p2
  where p2.access_token_hash = extensions.digest(_passport_token, 'sha256');

  if p.v_passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3) Tenant integrity.
  if p.v_event_id <> q.qr_event_id or p.v_agency_id <> q.qr_agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4) Settings.
  select coalesce(es.one_checkin_per_venue, true)         as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0) as min_seconds,
         coalesce(es.allow_manual_admin_checkins, false)  as allow_manual
    into s
  from (select 1) x
  left join public.event_checkin_settings es
    on es.event_id = q.qr_event_id;

  -- 5) One-per-venue idempotency.
  if s.one_per_venue then
    select c.id
      into v_existing
    from public.checkins c
    where c.passport_id = p.v_passport_id
      and c.venue_id    = q.qr_venue_id
    limit 1;

    if v_existing is not null then
      return query
        select v_existing, q.qr_venue_id, p.v_passport_id, false;
      return;
    end if;
  end if;

  -- 6) Rate limit / min gap.
  if s.min_seconds > 0 then
    select max(c.created_at)
      into v_last
    from public.checkins c
    where c.passport_id = p.v_passport_id;

    if v_last is not null
       and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7) Insert new checkin.
  insert into public.checkins (
    agency_id, event_id, passport_id, visitor_id,
    venue_id, venue_qr_code_id, source,
    client_ip, user_agent
  ) values (
    p.v_agency_id, p.v_event_id, p.v_passport_id, p.v_visitor_id,
    q.qr_venue_id, q.qr_id, 'qr_scan',
    _client_ip, _user_agent
  )
  returning id into v_checkin;

  return query
    select v_checkin, q.qr_venue_id, p.v_passport_id, true;
end;
$$;

-- Restate EXECUTE grants defensively (CREATE OR REPLACE preserves them).
grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

commit;

-- Rollback: re-apply the previous body from
-- supabase/migrations-draft-passport-stamps/02_fix_passport_lookup_pgcrypto.sql
-- (which is the ambiguous version this patch supersedes).
