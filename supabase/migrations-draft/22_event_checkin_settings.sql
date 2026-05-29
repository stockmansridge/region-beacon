-- 22_event_checkin_settings.sql
-- Draft only. Do not execute.

create table if not exists public.event_checkin_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  one_checkin_per_venue boolean not null default true,
  minimum_seconds_between_checkins int not null default 0 check (minimum_seconds_between_checkins >= 0),
  allow_manual_admin_checkins boolean not null default false,
  max_checkins_per_passport_per_day int check (max_checkins_per_passport_per_day is null or max_checkins_per_passport_per_day > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_checkin_settings_event_unique unique (event_id),
  constraint event_checkin_settings_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.event_checkin_settings;
create trigger set_updated_at
  before update on public.event_checkin_settings
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_checkin_settings to authenticated;
grant all on public.event_checkin_settings to service_role;

alter table public.event_checkin_settings enable row level security;

drop policy if exists deny_all on public.event_checkin_settings;
create policy deny_all on public.event_checkin_settings as restrictive for all to public using (false) with check (false);
