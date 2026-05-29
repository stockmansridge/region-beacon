-- 18_checkins.sql
-- Draft only. Do not execute.
-- Browser clients MUST NOT insert. Only redeem_checkin() writes.

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  passport_id uuid not null,
  visitor_id uuid not null,
  venue_id uuid not null,
  venue_qr_code_id uuid,
  source text not null default 'qr_scan' check (source in ('qr_scan','manual_admin')),
  created_by uuid,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint checkins_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint checkins_passport_fk
    foreign key (agency_id, event_id, passport_id) references public.passports(agency_id, event_id, id) on delete restrict,
  constraint checkins_visitor_fk
    foreign key (agency_id, event_id, visitor_id) references public.visitors(agency_id, event_id, id) on delete restrict,
  constraint checkins_venue_fk
    foreign key (agency_id, event_id, venue_id) references public.venues(agency_id, event_id, id) on delete restrict,
  constraint checkins_qr_fk
    foreign key (agency_id, event_id, venue_qr_code_id) references public.venue_qr_codes(agency_id, event_id, id) on delete set null,

  constraint checkins_one_per_passport_venue unique (passport_id, venue_id)
);

create index if not exists idx_checkins_event_time on public.checkins (event_id, created_at);
create index if not exists idx_checkins_agency_event on public.checkins (agency_id, event_id);
create index if not exists idx_checkins_qr on public.checkins (venue_qr_code_id);

-- Grants: SELECT only for authenticated; no INSERT/UPDATE/DELETE for anon or
-- authenticated. service_role gets ALL (migrations / break-glass only).
grant select on public.checkins to authenticated;
grant all on public.checkins to service_role;

alter table public.checkins enable row level security;

drop policy if exists deny_all on public.checkins;
create policy deny_all on public.checkins as restrictive for all to public using (false) with check (false);
