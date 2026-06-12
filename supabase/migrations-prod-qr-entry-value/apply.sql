-- Production fix: venue_qr_codes.entry_value missing in prod.
-- Symptom: redeem_checkin fails with 42703 "column qr.entry_value does not exist".
--
-- Safe to re-run. Idempotent.

begin;

-- 1) venue_qr_codes.entry_value
alter table public.venue_qr_codes
  add column if not exists entry_value int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venue_qr_codes_entry_value_range'
      and conrelid = 'public.venue_qr_codes'::regclass
  ) then
    alter table public.venue_qr_codes
      add constraint venue_qr_codes_entry_value_range
      check (entry_value >= 1 and entry_value <= 100);
  end if;
end $$;

-- Backfill (no-op if default already applied, but explicit for clarity).
update public.venue_qr_codes
  set entry_value = 1
  where entry_value is null;

comment on column public.venue_qr_codes.entry_value is
  'Points / prize-draw entries one scan of this QR is worth. Default 1. Changes only affect future check-ins.';

-- 2) checkins.entry_value (snapshot column written by redeem_checkin)
alter table public.checkins
  add column if not exists entry_value int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'checkins_entry_value_range'
      and conrelid = 'public.checkins'::regclass
  ) then
    alter table public.checkins
      add constraint checkins_entry_value_range
      check (entry_value >= 1 and entry_value <= 100);
  end if;
end $$;

update public.checkins
  set entry_value = 1
  where entry_value is null;

comment on column public.checkins.entry_value is
  'Snapshot of venue_qr_codes.entry_value at the moment of check-in. Source of truth for leaderboard points and prize-draw weighting.';

create index if not exists idx_checkins_passport_value
  on public.checkins (passport_id, entry_value);

-- 3) Patch redeem_checkin to read entry_value defensively via COALESCE.
-- Drop first because the live return type differs from this definition.
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
  is_new boolean
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
begin
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         coalesce(qr.entry_value, 1) as entry_value,
         e.status as event_status
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  where qr.token = _qr_token and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  v_entry_value := greatest(1, least(coalesce(q.entry_value, 1), 100));

  select pp.id as passport_id, pp.agency_id, pp.event_id, pp.visitor_id
    into p
  from public.passports pp
  where pp.access_token_hash = digest(_passport_token, 'sha256');

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
      return query select v_existing, q.venue_id, p.passport_id, false;
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

  return query select v_checkin, q.venue_id, p.passport_id, true;
end;
$$;

grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

commit;

-- ------------------------------------------------------------------
-- Verification (run after apply):
-- ------------------------------------------------------------------
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name in ('venue_qr_codes','checkins')
--   and column_name='entry_value';
--
-- select id, venue_id, status, entry_value
-- from public.venue_qr_codes
-- where token = 'HJPIZKfvIGQXYO9QQl4vSRwjuNw4N2_q';
--
-- -- Live redemption against the reported QR + a known passport_token:
-- -- select * from public.redeem_checkin(
-- --   'HJPIZKfvIGQXYO9QQl4vSRwjuNw4N2_q',
-- --   '<passport_access_token>'
-- -- );
--
-- select entry_value, created_at
-- from public.checkins
-- order by created_at desc limit 5;
