-- 23_export_logs.sql
-- Draft only. Do not execute.
-- Immutable. Inserted only via export RPCs.

create table if not exists public.export_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('visitors','checkins','passports','prize_entrants')),
  prize_rule_id uuid,
  row_count int not null default 0,
  filters jsonb,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint export_logs_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint export_logs_prize_rule_fk
    foreign key (prize_rule_id) references public.prize_rules(id) on delete set null
);

create index if not exists idx_export_logs_agency_event on public.export_logs (agency_id, event_id, created_at desc);
create index if not exists idx_export_logs_user on public.export_logs (user_id);

grant select on public.export_logs to authenticated;
grant all on public.export_logs to service_role;

alter table public.export_logs enable row level security;

drop policy if exists deny_all on public.export_logs;
create policy deny_all on public.export_logs as restrictive for all to public using (false) with check (false);
