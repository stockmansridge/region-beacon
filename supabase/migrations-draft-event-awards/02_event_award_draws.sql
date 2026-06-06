-- 02_event_award_draws.sql — DRAFT only.
--
-- Append-only history of every award winner draw. Redrawing keeps the
-- previous record; UI flags the newest as current.

begin;

create table if not exists public.event_award_draws (
  id                         uuid primary key default gen_random_uuid(),
  award_id                   uuid not null references public.event_awards(id) on delete cascade,
  event_id                   uuid not null,
  agency_id                  uuid not null,
  winner_passport_id         uuid not null,
  winner_participant_name    text,
  winner_participant_email   text,
  eligible_count             integer not null default 0,
  drawn_by                   uuid references auth.users(id),
  drawn_at                   timestamptz not null default now(),
  notes                      text,

  constraint event_award_draws_event_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  constraint event_award_draws_passport_fk
    foreign key (winner_passport_id)
    references public.passports(id) on delete restrict,
  constraint event_award_draws_eligible_count_non_negative
    check (eligible_count >= 0)
);

create index if not exists idx_event_award_draws_award
  on public.event_award_draws (award_id, drawn_at desc);
create index if not exists idx_event_award_draws_event
  on public.event_award_draws (event_id, drawn_at desc);
create index if not exists idx_event_award_draws_agency
  on public.event_award_draws (agency_id);

grant select on public.event_award_draws to authenticated;
grant all on public.event_award_draws to service_role;

alter table public.event_award_draws enable row level security;

drop policy if exists event_award_draws_deny_all on public.event_award_draws;
create policy event_award_draws_deny_all on public.event_award_draws
  as restrictive for all to public using (false) with check (false);

commit;
