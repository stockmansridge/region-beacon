-- 21_leaderboard_settings.sql
-- Draft only. Do not execute.
-- Disabled by default. Public projection enforced inside get_public_leaderboard.

create table if not exists public.leaderboard_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  is_enabled boolean not null default false,
  display_mode text not null default 'first_name_last_initial'
    check (display_mode in ('first_name_last_initial','first_name_only','alias_only','anonymous')),
  show_first_name boolean not null default true,
  show_last_initial boolean not null default true,
  show_visit_count boolean not null default true,
  hide_below_checkins int not null default 1 check (hide_below_checkins >= 0),
  allow_visitor_opt_out boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leaderboard_settings_event_unique unique (event_id),
  constraint leaderboard_settings_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.leaderboard_settings;
create trigger set_updated_at
  before update on public.leaderboard_settings
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.leaderboard_settings to authenticated;
grant all on public.leaderboard_settings to service_role;

alter table public.leaderboard_settings enable row level security;

drop policy if exists deny_all on public.leaderboard_settings;
create policy deny_all on public.leaderboard_settings as restrictive for all to public using (false) with check (false);
