-- 19_reward_rules.sql
-- Draft only. Do not execute.

create table if not exists public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  rule_type text not null check (rule_type in ('min_checkins','all_venues','specific_set')),
  threshold int,
  required_venue_ids uuid[],
  reward_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reward_rules_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

create index if not exists idx_reward_rules_event_active on public.reward_rules (event_id, is_active);

drop trigger if exists set_updated_at on public.reward_rules;
create trigger set_updated_at
  before update on public.reward_rules
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.reward_rules to authenticated;
grant all on public.reward_rules to service_role;

alter table public.reward_rules enable row level security;

drop policy if exists deny_all on public.reward_rules;
create policy deny_all on public.reward_rules as restrictive for all to public using (false) with check (false);
