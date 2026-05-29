# Public Leaderboard RPC (draft only)

Draft only. **Do not execute.** No production, schema, RLS, or storage changes
are applied by reviewing these files.

## Target route

Future public page: `/live/$subdomain/leaderboard`
Production equivalent: `{subdomain}.getstamped.com.au/leaderboard`.

## Existing schema findings

Inspected the existing draft schema under `supabase/migrations-draft/`:

- `public.leaderboard_settings` (21) — already models everything we need:
  `is_enabled`, `display_mode`
  (`first_name_last_initial` | `first_name_only` | `alias_only` | `anonymous`),
  `show_first_name`, `show_last_initial`, `show_visit_count`,
  `hide_below_checkins`, `allow_visitor_opt_out`.
- `public.passports.leaderboard_opt_out boolean not null default false` (16).
  **Per-visitor opt-out IS supported** at the passport level — no new column
  needed. (If product later wants a visitor-level opt-out independent of
  event passport, that would be a follow-up migration.)
- `public.visitors` (15) holds PII (`email`, `full_name`, `first_name`,
  `last_name`, `mobile`, `postcode`). These must never leave the RPC.
- `public.checkins` (18) is the source for visit counts; aggregated per
  `passport_id` (each passport is unique per `(event_id, visitor_id)`).
- `public.resolve_event_by_host(_hostname)` (32) already returns
  `kind ∈ {marketing, admin, event, not_found}`. The publishing-gate draft
  (`migrations-draft-publishing-gate/01_…`) additionally requires
  `event_is_publishable(e.id) = true` before returning `kind='event'`,
  which is exactly the live/publishable gate we need here.
- An RPC `public.get_public_leaderboard(_event_id uuid)` already exists in
  the draft (32) and returns only `(display_name, visit_count)`. The new
  by-domain RPC wraps it so the public page never needs to pass an
  `event_id` from the client.

## Proposed RPC

Signature:

```
public.get_public_leaderboard_by_domain(_hostname text)
returns table (
  rank          int,
  display_name  text,
  visit_count   int,
  is_enabled    boolean,
  event_found   boolean
)
language plpgsql stable security definer set search_path = public
```

Behaviour:

1. Resolve the host via `resolve_event_by_host(_hostname)`.
2. If `kind <> 'event'` → return a single row
   `(null, null, null, null, false)` so the client can render
   *"Event not found."* (No private data, no row leak.)
3. If `leaderboard_settings.is_enabled = false` (or no row) → return
   `(null, null, null, false, true)` so the client can render
   *"Leaderboard is not enabled for this event."*
4. Otherwise aggregate `checkins` by `passport_id`, apply
   `hide_below_checkins`, honour `passports.leaderboard_opt_out` when
   `allow_visitor_opt_out = true`, and format `display_name` server-side
   according to `display_mode` / `show_first_name` / `show_last_initial`.
5. `visit_count` is `null` unless `show_visit_count = true`.
6. `rank` is `dense_rank() over (order by cnt desc)`.

Fields returned (the **only** fields):

- `rank` int
- `display_name` text  (formatted by RPC; never raw `full_name`)
- `visit_count` int | null
- `is_enabled` boolean (control flag, not data)
- `event_found` boolean (control flag, not data)

Privacy model:

- Never select `email`, `mobile`, `postcode`, `full_name`, `visitor.id`,
  `passport.id`, `access_token_hash`, or any admin/billing columns.
- `display_name` is computed inside the function from `first_name` and
  `last_name`'s first letter only, mirroring the existing
  `get_public_leaderboard` projection.
- `SECURITY DEFINER` with `set search_path = public`. Granted EXECUTE to
  `anon, authenticated`. No table grants are changed.
- Function is `stable` and returns no rows for not-found / disabled cases
  beyond the single control-flag sentinel row.

## Files

- `01_get_public_leaderboard_by_domain.sql` — function definition + grants.
- `02_verify.sql` — read-only smoke checks for disabled / not-live / live /
  `hide_below_checkins` / `display_mode` paths and a column-leak guard.

## Not done in this draft

- No public page wiring.
- No new tables, columns, RLS, storage, or grants beyond `EXECUTE` on the
  new function.
- No change to existing `get_public_leaderboard(_event_id)`; it remains
  available for admin previews that already pass an event id.
