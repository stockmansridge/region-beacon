-- 01_qr_and_checkin_entry_value.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Adds a configurable per-QR `entry_value` (default 1) and snapshots it
-- onto each new check-in. Old rows are backfilled to 1.
--
-- Design intent:
--   * The QR row is the source of truth for *future* entry values.
--   * The checkin row is the source of truth for *historic* entry values.
--     Changing a QR's value never alters past entries.
--
-- Dependencies (already drafted live):
--   * public.venue_qr_codes (migrations-draft/13)
--   * public.checkins       (migrations-draft/18)

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

comment on column public.venue_qr_codes.entry_value is
  'How many leaderboard points / prize-draw entries one scan of this QR is worth. Default 1. Changes only affect future check-ins; historic checkins keep their snapshotted value.';

-- 2) checkins.entry_value (snapshot)
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

comment on column public.checkins.entry_value is
  'Snapshot of venue_qr_codes.entry_value at the moment of check-in. Source of truth for leaderboard points and prize-draw weighting; never updated after insert.';

-- 3) Helpful index for tier / leaderboard sums.
create index if not exists idx_checkins_passport_value
  on public.checkins (passport_id, entry_value);

commit;

-- Rollback notes:
--   begin;
--   drop index if exists public.idx_checkins_passport_value;
--   alter table public.checkins
--     drop constraint if exists checkins_entry_value_range,
--     drop column     if exists entry_value;
--   alter table public.venue_qr_codes
--     drop constraint if exists venue_qr_codes_entry_value_range,
--     drop column     if exists entry_value;
--   commit;
