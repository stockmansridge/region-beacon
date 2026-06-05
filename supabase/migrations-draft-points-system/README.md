# Points System — Stage 1: Data model foundations

Draft migration. **Not auto-executed.** Apply via Lovable Cloud migration tool after review.

## What this stage does

Adds the safe database foundation for the new GetStampd points system.
This is purely additive — existing passport stamps and check-ins are
unchanged. Points are a parallel ledger.

## Files

- `01_points_system_foundation.sql` — all schema and RLS changes.

## Where things live

| Concern | Decision |
|---|---|
| Per-venue points | `public.venues.points_value` (already event-scoped via `venues.event_id`; no `event_venues` table exists in this project) |
| Bonus codes | `public.event_bonus_codes` (tenant-scoped `agency_id` + `event_id`) |
| Awards ledger | `public.participant_point_awards` (FK to `passports`) |
| Summary | `public.get_event_participant_points(p_event_id uuid)` RPC |

## Participant identity

`participant_id` references **`public.passports.id`** via a composite
`(agency_id, event_id, participant_id)` FK, matching the pattern used by
`public.checkins`. We deliberately do not add a new participant identity
or reference `visitors`/`auth.users` directly. Passports are the
event-scoped identity for stamps today, so the points ledger lines up
with passport progress and the same admin/leaderboard semantics.

> Uncertainty: if any future flow needs to award points before a
> passport row exists (e.g. a bonus QR scanned before registration),
> the claim RPC must create/find the passport first, then insert the
> award. This is the same constraint check-ins already have.

## RLS policies added

- `event_bonus_codes_select` — platform admin or agency member can read.
- `event_bonus_codes_write` — platform admin or agency admin can write.
- `participant_point_awards_select` — platform admin or agency member
  can read.
- **No** insert/update/delete policies on `participant_point_awards`.
  Writes are intended to flow through `SECURITY DEFINER` claim RPCs
  added in a later stage (`venue claim` and `bonus claim`). This makes
  it impossible for a public/authenticated client to choose their own
  points value.

Direct public read access to bonus codes is **not** granted; the public
claim flow will go through a controlled RPC in a later stage.

## Safety properties

- All `add column`, `add constraint`, `create index`, `create policy`
  guards are idempotent.
- Unique partial index `participant_point_awards_unique_source`
  prevents double-awarding the same (event, participant, type, source).
- All new tables get `service_role` `ALL` and minimal `authenticated`
  grants; `anon` is never granted.
- `tg_set_updated_at` (existing project helper) is reused for
  `event_bonus_codes`.

## Verification

After applying, run:

```sql
select
  exists (select 1 from information_schema.tables
          where table_schema='public' and table_name='event_bonus_codes')
    as has_bonus_codes_table,
  exists (select 1 from information_schema.tables
          where table_schema='public' and table_name='participant_point_awards')
    as has_point_awards_table,
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='venues'
            and column_name='points_value')
    as venues_has_points_value;
```

All three should return `true`.

## Out of scope for this stage

- Bonus Codes admin UI
- Public collection / claim page
- Leaderboard changes
- Venue scan points logic
- QR claim RPCs (venue + bonus)
