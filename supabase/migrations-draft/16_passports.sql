-- 16_passports.sql
-- Draft only. Do not execute.
-- access_token_hash stores SHA-256 of the raw token. Raw token never stored.

create table if not exists public.passports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  visitor_id uuid not null,
  access_token_hash bytea not null,
  status text not null default 'active' check (status in ('active','completed','forfeited')),
  completed_at timestamptz,
  leaderboard_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint passports_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint passports_visitor_fk
    foreign key (agency_id, event_id, visitor_id) references public.visitors(agency_id, event_id, id) on delete cascade,
  constraint passports_one_per_visitor unique (event_id, visitor_id),
  constraint passports_token_hash_unique unique (access_token_hash),
  constraint passports_tenant_unique unique (agency_id, event_id, id)
);

create index if not exists idx_passports_event_status on public.passports (agency_id, event_id, status);

drop trigger if exists set_updated_at on public.passports;
create trigger set_updated_at
  before update on public.passports
  for each row execute function public.tg_set_updated_at();

grant select, update, delete on public.passports to authenticated;
grant all on public.passports to service_role;
-- No INSERT grant: passports created via register_visitor() definer RPC.

alter table public.passports enable row level security;

drop policy if exists deny_all on public.passports;
create policy deny_all on public.passports as restrictive for all to public using (false) with check (false);
