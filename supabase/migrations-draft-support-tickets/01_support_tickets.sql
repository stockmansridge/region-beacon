-- GetStampd Support Tickets
-- Additive, idempotent. Safe to run multiple times against production.
--
-- Adds:
--   * public.support_tickets table
--   * RLS policies (users see own; platform admins see all)
--   * RPCs used by the app:
--       - public.create_support_ticket(...)
--       - public.system_admin_support_tickets(...)
--       - public.system_admin_support_ticket_counts()
--       - public.system_admin_update_support_ticket(...)
--   * Grants for authenticated + service_role

begin;

-- 1. Table -------------------------------------------------------------------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid null references public.agencies(id) on delete set null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  description text not null,
  category text not null default 'other',
  priority text not null default 'normal',
  status text not null default 'new',
  page_url text null,
  user_agent text null,
  admin_notes text null,
  resolved_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Constrain enum-ish columns (idempotent re-add via DO blocks).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_status_check'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_status_check
      check (status in ('new','open','in_progress','waiting_on_user','resolved','closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_priority_check'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_priority_check
      check (priority in ('low','normal','high','urgent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_category_check'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_category_check
      check (category in (
        'account_billing','event_setup','passport_or_checkin',
        'user_access','bug','feature_request','other'
      ));
  end if;
end$$;

create index if not exists support_tickets_status_idx
  on public.support_tickets (status);
create index if not exists support_tickets_org_idx
  on public.support_tickets (organisation_id);
create index if not exists support_tickets_submitted_by_idx
  on public.support_tickets (submitted_by);
create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);

-- Touch updated_at on every update.
create or replace function public.support_tickets_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.support_tickets_set_updated_at();

-- 2. Grants ------------------------------------------------------------------

grant select, insert on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

-- 3. RLS ---------------------------------------------------------------------

alter table public.support_tickets enable row level security;

-- Platform-admin helper. Prefer existing public.is_platform_admin(uuid) if
-- present (older deployments); otherwise look up the user_roles table
-- defensively without coupling to a particular helper signature.
do $$
declare
  has_helper boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_platform_admin'
  ) into has_helper;

  -- Drop & recreate policies idempotently.
  execute 'drop policy if exists support_tickets_insert_own on public.support_tickets';
  execute 'drop policy if exists support_tickets_select_own on public.support_tickets';
  execute 'drop policy if exists support_tickets_select_admin on public.support_tickets';
  execute 'drop policy if exists support_tickets_update_admin on public.support_tickets';

  execute $p$
    create policy support_tickets_insert_own
      on public.support_tickets
      for insert
      to authenticated
      with check (submitted_by = auth.uid())
  $p$;

  execute $p$
    create policy support_tickets_select_own
      on public.support_tickets
      for select
      to authenticated
      using (submitted_by = auth.uid())
  $p$;

  if has_helper then
    execute $p$
      create policy support_tickets_select_admin
        on public.support_tickets
        for select
        to authenticated
        using (public.is_platform_admin(auth.uid()))
    $p$;
    execute $p$
      create policy support_tickets_update_admin
        on public.support_tickets
        for update
        to authenticated
        using (public.is_platform_admin(auth.uid()))
        with check (public.is_platform_admin(auth.uid()))
    $p$;
  else
    execute $p$
      create policy support_tickets_select_admin
        on public.support_tickets
        for select
        to authenticated
        using (exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid() and ur.role = 'platform_admin'
        ))
    $p$;
    execute $p$
      create policy support_tickets_update_admin
        on public.support_tickets
        for update
        to authenticated
        using (exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid() and ur.role = 'platform_admin'
        ))
        with check (exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid() and ur.role = 'platform_admin'
        ))
    $p$;
  end if;
end$$;

-- 4. RPCs --------------------------------------------------------------------

-- Submit a ticket. Runs as the caller so RLS + auth.uid() apply.
create or replace function public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category text default 'other',
  p_priority text default 'normal',
  p_organisation_id uuid default null,
  p_page_url text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if coalesce(trim(p_subject), '') = '' then
    raise exception 'subject_required';
  end if;
  if coalesce(trim(p_description), '') = '' then
    raise exception 'description_required';
  end if;

  insert into public.support_tickets (
    organisation_id, submitted_by, subject, description,
    category, priority, page_url, user_agent
  ) values (
    p_organisation_id, v_uid, left(p_subject, 200), left(p_description, 4000),
    coalesce(p_category, 'other'), coalesce(p_priority, 'normal'),
    nullif(left(coalesce(p_page_url, ''), 1000), ''),
    nullif(left(coalesce(p_user_agent, ''), 500), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_support_ticket(
  text, text, text, text, uuid, text, text
) to authenticated;

-- Admin listing with organisation + submitter info joined.
create or replace function public.system_admin_support_tickets(
  p_status text default null,
  p_limit int default 200
)
returns table (
  id uuid,
  organisation_id uuid,
  organisation_name text,
  submitted_by uuid,
  submitted_by_email text,
  subject text,
  description text,
  category text,
  priority text,
  status text,
  page_url text,
  admin_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_admin'
  ) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    t.id,
    t.organisation_id,
    a.name as organisation_name,
    t.submitted_by,
    u.email::text as submitted_by_email,
    t.subject,
    t.description,
    t.category,
    t.priority,
    t.status,
    t.page_url,
    t.admin_notes,
    t.created_at,
    t.updated_at,
    t.resolved_at,
    t.closed_at
  from public.support_tickets t
  left join public.agencies a on a.id = t.organisation_id
  left join auth.users u on u.id = t.submitted_by
  where p_status is null or t.status = p_status
  order by
    case t.priority
      when 'urgent' then 0
      when 'high'   then 1
      when 'normal' then 2
      when 'low'    then 3
      else 4
    end,
    t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

grant execute on function public.system_admin_support_tickets(text, int) to authenticated;

-- Lightweight count RPC for the System Admin alert banner.
create or replace function public.system_admin_support_ticket_counts()
returns table (
  open_count bigint,
  urgent_open_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_admin'
  ) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    count(*) filter (
      where t.status in ('new','open','in_progress','waiting_on_user')
    )::bigint as open_count,
    count(*) filter (
      where t.priority = 'urgent'
        and t.status in ('new','open','in_progress','waiting_on_user')
    )::bigint as urgent_open_count
  from public.support_tickets t;
end;
$$;

grant execute on function public.system_admin_support_ticket_counts() to authenticated;

-- Admin update (status / priority / admin_notes).
create or replace function public.system_admin_update_support_ticket(
  p_id uuid,
  p_status text default null,
  p_priority text default null,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_admin'
  ) then
    raise exception 'not_authorized';
  end if;

  update public.support_tickets
  set
    status       = coalesce(p_status,   status),
    priority     = coalesce(p_priority, priority),
    admin_notes  = coalesce(p_admin_notes, admin_notes),
    resolved_at  = case
                     when p_status = 'resolved' and resolved_at is null then v_now
                     when p_status is not null and p_status <> 'resolved' then resolved_at
                     else resolved_at
                   end,
    closed_at    = case
                     when p_status = 'closed' and closed_at is null then v_now
                     else closed_at
                   end
  where id = p_id;
end;
$$;

grant execute on function public.system_admin_update_support_ticket(uuid, text, text, text)
  to authenticated;

commit;
