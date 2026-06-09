-- System Admin: Support Action Audit Log
--
-- Adds a small additive table to record platform-admin operational
-- support actions (e.g. resending a verification email) and a
-- SECURITY DEFINER RPC for inserting entries that is gated on
-- public.is_platform_admin(auth.uid()).
--
-- Idempotent: safe to re-run.

set search_path = public;

create table if not exists public.admin_support_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_user_id uuid,
  target_email text,
  performed_by uuid not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists admin_support_actions_target_user_idx
  on public.admin_support_actions (target_user_id, occurred_at desc);
create index if not exists admin_support_actions_occurred_at_idx
  on public.admin_support_actions (occurred_at desc);

grant select on public.admin_support_actions to authenticated;
grant all on public.admin_support_actions to service_role;

alter table public.admin_support_actions enable row level security;

drop policy if exists "Platform admins can read support actions"
  on public.admin_support_actions;
create policy "Platform admins can read support actions"
on public.admin_support_actions
for select
to authenticated
using (public.is_platform_admin(auth.uid()));

-- Insert RPC (no direct insert policy; insert path goes through this fn) ----

create or replace function public.system_admin_log_support_action(
  p_action text,
  p_target_user_id uuid,
  p_target_email text,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden: platform_admin required'
      using errcode = '42501';
  end if;
  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'action is required';
  end if;

  insert into public.admin_support_actions (
    action, target_user_id, target_email, performed_by, source, metadata
  ) values (
    p_action, p_target_user_id, nullif(trim(coalesce(p_target_email, '')), ''),
    auth.uid(), nullif(trim(coalesce(p_source, '')), ''), coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.system_admin_log_support_action(text, uuid, text, text, jsonb) from public;
grant execute on function public.system_admin_log_support_action(text, uuid, text, text, jsonb) to authenticated;
