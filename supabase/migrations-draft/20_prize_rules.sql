-- 20_prize_rules.sql
-- Draft only. Do not execute.

create table if not exists public.prize_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  prize_type text not null check (prize_type in ('draw_entry','instant_reward','completion_prize')),
  threshold_checkins int,
  requires_completion boolean not null default false,
  entries_per_threshold int not null default 1 check (entries_per_threshold >= 1),
  max_entries_per_passport int,
  prize_name text,
  prize_instructions text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prize_rules_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

create index if not exists idx_prize_rules_event_active on public.prize_rules (event_id, is_active);
create index if not exists idx_prize_rules_type on public.prize_rules (prize_type);

drop trigger if exists set_updated_at on public.prize_rules;
create trigger set_updated_at
  before update on public.prize_rules
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.prize_rules to authenticated;
grant all on public.prize_rules to service_role;

alter table public.prize_rules enable row level security;

drop policy if exists deny_all on public.prize_rules;
create policy deny_all on public.prize_rules as restrictive for all to public using (false) with check (false);
