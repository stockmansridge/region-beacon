-- 17_visitor_consents.sql
-- Draft only. Do not execute.
-- Append-only consent ledger. UPDATE/DELETE blocked via policies in step 28.

create table if not exists public.visitor_consents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  visitor_id uuid not null,
  passport_id uuid,
  consent_type text not null check (consent_type in ('terms','privacy','marketing')),
  decision text not null check (decision in ('granted','withdrawn')),
  terms_version_id uuid,
  decided_at timestamptz not null default now(),
  client_ip inet,
  user_agent text,

  constraint visitor_consents_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint visitor_consents_visitor_fk
    foreign key (agency_id, event_id, visitor_id) references public.visitors(agency_id, event_id, id) on delete cascade,
  constraint visitor_consents_passport_fk
    foreign key (agency_id, event_id, passport_id) references public.passports(agency_id, event_id, id) on delete set null,
  constraint visitor_consents_terms_version_fk
    foreign key (agency_id, event_id, terms_version_id) references public.event_terms_versions(agency_id, event_id, id) on delete restrict,

  constraint visitor_consents_terms_require_version check (
    case when consent_type in ('terms','privacy') then terms_version_id is not null else true end
  )
);

create index if not exists idx_visitor_consents_visitor on public.visitor_consents (visitor_id, consent_type, decided_at desc);
create index if not exists idx_visitor_consents_event   on public.visitor_consents (event_id, consent_type);

grant select on public.visitor_consents to authenticated;
grant all on public.visitor_consents to service_role;
-- No INSERT grant: written only by definer RPCs.

alter table public.visitor_consents enable row level security;

drop policy if exists deny_all on public.visitor_consents;
create policy deny_all on public.visitor_consents as restrictive for all to public using (false) with check (false);
