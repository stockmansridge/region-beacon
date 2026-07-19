-- Restore bonus code loading in the admin UI.
--
-- Symptom: "Could not load bonus codes." — the admin fetch selects
--   scope, kind, social_location, social_hashtags
-- from public.event_bonus_codes. If any of those columns are missing
-- (per-venue / social draft migrations never applied to production),
-- PostgREST returns 400 and the whole list appears empty. The rows
-- themselves are not lost — only the query fails.
--
-- Safe to run repeatedly.

begin;

alter table public.event_bonus_codes
  add column if not exists scope text not null default 'event',
  add column if not exists kind text not null default 'points',
  add column if not exists social_location text,
  add column if not exists social_hashtags text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_bonus_codes_scope_check'
  ) then
    alter table public.event_bonus_codes
      add constraint event_bonus_codes_scope_check
      check (scope in ('event','per_venue'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_bonus_codes_kind_check'
  ) then
    alter table public.event_bonus_codes
      add constraint event_bonus_codes_kind_check
      check (kind in ('points','social'));
  end if;
end$$;

commit;
