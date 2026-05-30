-- 04_prize_draw_results.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Append-only audit ledger of every prize-draw selection. Records the
-- seed used, prize_rule, pool size, winner's entries, and drawn_by so
-- any draw can be reproduced offline by an auditor.
--
-- No updates / no deletes — RLS + grants forbid both. Only the
-- admin_draw_prize_winner RPC (SECURITY DEFINER, role-gated) inserts.

begin;

create table if not exists public.prize_draw_results (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null,
  event_id        uuid not null,
  prize_rule_id   uuid not null,
  passport_id     uuid not null,
  visitor_id      uuid not null,
  winner_entries  int  not null check (winner_entries >= 1),
  pool_size       int  not null check (pool_size >= 1),
  total_entries   int  not null check (total_entries >= 1),
  seed            uuid not null,
  drawn_by        uuid,                          -- auth.uid() at draw time
  drawn_at        timestamptz not null default now(),
  notes           text,

  constraint prize_draw_results_event_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  constraint prize_draw_results_prize_fk
    foreign key (prize_rule_id)
    references public.prize_rules(id) on delete cascade,
  constraint prize_draw_results_passport_fk
    foreign key (agency_id, event_id, passport_id)
    references public.passports(agency_id, event_id, id) on delete restrict,
  constraint prize_draw_results_visitor_fk
    foreign key (agency_id, event_id, visitor_id)
    references public.visitors(agency_id, event_id, id) on delete restrict
);

create index if not exists idx_prize_draw_results_event
  on public.prize_draw_results (event_id, drawn_at desc);
create index if not exists idx_prize_draw_results_prize
  on public.prize_draw_results (prize_rule_id, drawn_at desc);

-- SELECT only for authenticated (admin UI reads). No INSERT/UPDATE/DELETE
-- for either anon or authenticated — the SECURITY DEFINER RPC is the
-- single writer.
grant select on public.prize_draw_results to authenticated;
grant all on public.prize_draw_results to service_role;

alter table public.prize_draw_results enable row level security;

drop policy if exists deny_all on public.prize_draw_results;
create policy deny_all on public.prize_draw_results
  as restrictive for all to public using (false) with check (false);

-- Read policy lives in 05 (alongside the role helpers used by the RPCs).

commit;

-- Rollback notes:
--   begin;
--   drop table if exists public.prize_draw_results;
--   commit;
