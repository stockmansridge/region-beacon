-- 10_event_branding.sql
-- Draft only. Do not execute.

create table if not exists public.event_branding (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  logo_path text,
  cover_path text,
  primary_color text,
  accent_color text,
  font_family text,
  welcome_copy text,
  terms_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_branding_event_unique unique (event_id),
  constraint event_branding_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.event_branding;
create trigger set_updated_at
  before update on public.event_branding
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_branding to authenticated;
grant all on public.event_branding to service_role;

alter table public.event_branding enable row level security;

drop policy if exists deny_all on public.event_branding;
create policy deny_all on public.event_branding as restrictive for all to public using (false) with check (false);
