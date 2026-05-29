-- 07_audit_logs.sql
-- Draft only. Do not execute.
-- Created EARLY so later audit triggers (step 30) can target it.
-- NOTE: no trigger is ever attached to audit_logs itself (recursive audit).

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,
  event_id uuid,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_agency on public.audit_logs (agency_id, created_at desc);
create index if not exists idx_audit_logs_event  on public.audit_logs (event_id, created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_actor  on public.audit_logs (actor_user_id);

grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

drop policy if exists deny_all on public.audit_logs;
create policy deny_all on public.audit_logs as restrictive for all to public using (false) with check (false);
