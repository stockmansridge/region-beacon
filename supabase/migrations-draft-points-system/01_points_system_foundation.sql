-- Points System Stage 1: Data model foundations.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Adds:
--   * public.venues.points_value             (event-specific venue points)
--   * public.event_bonus_codes               (event-level QR bonus codes)
--   * public.participant_point_awards        (ledger of awarded points)
--   * public.get_event_participant_points()  (summary RPC)
--
-- Note on participant identity:
--   GetStampd participants are modeled as `public.passports` (one per
--   visitor per event). `participant_id` here references `passports.id`
--   so we do not introduce a competing identity. Visitors/users are
--   intentionally NOT referenced directly.

-- =====================================================================
-- Part A — Venue points (event-specific via public.venues)
-- =====================================================================
-- There is no event_venues join table in this project; `public.venues`
-- is already event-scoped (venues.event_id), so points_value lives here.

alter table public.venues
  add column if not exists points_value integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_points_value_non_negative'
  ) then
    alter table public.venues
      add constraint venues_points_value_non_negative
      check (points_value >= 0);
  end if;
end $$;

-- =====================================================================
-- Part B — Event bonus codes
-- =====================================================================
create table if not exists public.event_bonus_codes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  description text,
  points_value integer not null default 0,
  qr_code_token text not null unique,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_bonus_codes_event_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  -- Composite uniqueness so later ledger rows can FK back tenant-safely.
  constraint event_bonus_codes_tenant_unique unique (agency_id, event_id, id)
);

create index if not exists idx_event_bonus_codes_event
  on public.event_bonus_codes (event_id, is_active);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_bonus_codes_name_not_blank'
  ) then
    alter table public.event_bonus_codes
      add constraint event_bonus_codes_name_not_blank
      check (length(trim(name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_bonus_codes_points_value_non_negative'
  ) then
    alter table public.event_bonus_codes
      add constraint event_bonus_codes_points_value_non_negative
      check (points_value >= 0);
  end if;
end $$;

-- Reuse project's standard updated_at trigger helper (public.tg_set_updated_at).
drop trigger if exists set_updated_at on public.event_bonus_codes;
create trigger set_updated_at
  before update on public.event_bonus_codes
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_bonus_codes to authenticated;
grant all on public.event_bonus_codes to service_role;

alter table public.event_bonus_codes enable row level security;

drop policy if exists deny_all on public.event_bonus_codes;

create policy event_bonus_codes_select
  on public.event_bonus_codes for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy event_bonus_codes_write
  on public.event_bonus_codes for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- =====================================================================
-- Part C — Participant point awards (ledger)
-- =====================================================================
-- participant_id references public.passports(id). We use composite FKs
-- (agency_id, event_id, participant_id) to match the project's tenant
-- isolation pattern (mirrors checkins).
create table if not exists public.participant_point_awards (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  participant_id uuid not null,
  award_type text not null,
  source_id uuid,
  points_awarded integer not null,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint participant_point_awards_event_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  constraint participant_point_awards_passport_fk
    foreign key (agency_id, event_id, participant_id)
    references public.passports(agency_id, event_id, id) on delete cascade
);

create index if not exists idx_ppa_event_participant
  on public.participant_point_awards (event_id, participant_id);
create index if not exists idx_ppa_event_type
  on public.participant_point_awards (event_id, award_type);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'participant_point_awards_type_check'
  ) then
    alter table public.participant_point_awards
      add constraint participant_point_awards_type_check
      check (award_type in ('venue','bonus'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'participant_point_awards_points_non_negative'
  ) then
    alter table public.participant_point_awards
      add constraint participant_point_awards_points_non_negative
      check (points_awarded >= 0);
  end if;
end $$;

-- Duplicate prevention: one award per (event, participant, type, source).
create unique index if not exists participant_point_awards_unique_source
  on public.participant_point_awards (event_id, participant_id, award_type, source_id)
  where source_id is not null;

-- Grants: SELECT only for authenticated (admin reporting via RLS).
-- No INSERT/UPDATE/DELETE for authenticated — awards must be written by
-- SECURITY DEFINER RPCs (venue claim / bonus claim), to be added later.
grant select on public.participant_point_awards to authenticated;
grant all on public.participant_point_awards to service_role;

alter table public.participant_point_awards enable row level security;

drop policy if exists deny_all on public.participant_point_awards;

create policy participant_point_awards_select
  on public.participant_point_awards for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );
-- No INSERT/UPDATE/DELETE policies: definer RPCs only.

-- =====================================================================
-- Part D — Summary RPC
-- =====================================================================
create or replace function public.get_event_participant_points(p_event_id uuid)
returns table (
  participant_id uuid,
  total_points integer,
  venue_points integer,
  bonus_points integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ppa.participant_id,
    coalesce(sum(ppa.points_awarded), 0)::integer as total_points,
    coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'venue'), 0)::integer as venue_points,
    coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'bonus'), 0)::integer as bonus_points
  from public.participant_point_awards ppa
  join public.events e
    on e.id = ppa.event_id
   and e.agency_id = ppa.agency_id
  where ppa.event_id = p_event_id
    and (
      public.is_platform_admin(auth.uid())
      or public.is_agency_member(auth.uid(), e.agency_id)
    )
  group by ppa.participant_id;
$$;

revoke all on function public.get_event_participant_points(uuid) from public;
grant execute on function public.get_event_participant_points(uuid) to authenticated;

-- =====================================================================
-- Part F — Verification
-- =====================================================================
-- Run after applying:
--   select
--     exists (
--       select 1 from information_schema.tables
--       where table_schema = 'public' and table_name = 'event_bonus_codes'
--     ) as has_bonus_codes_table,
--     exists (
--       select 1 from information_schema.tables
--       where table_schema = 'public' and table_name = 'participant_point_awards'
--     ) as has_point_awards_table,
--     exists (
--       select 1 from information_schema.columns
--       where table_schema = 'public' and table_name = 'venues' and column_name = 'points_value'
--     ) as venues_has_points_value;
