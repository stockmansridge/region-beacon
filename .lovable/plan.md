# Per-venue bonus codes

Add an optional "Per-venue" mode to event bonus codes. Same bonus config (name, description, points), but the admin ticks which venues participate; each participating venue gets its own QR token. A customer can claim once per (venue, customer) and gets the full point value at every venue they scan.

Event-wide bonuses continue to work exactly as today.

## Data model

New table `public.event_bonus_code_venues`:
- `id uuid pk`
- `agency_id`, `event_id`, `bonus_code_id` (FK → event_bonus_codes, cascade)
- `venue_id` (FK → venues, cascade, tenant-scoped composite FK)
- `qr_code_token text not null unique` (server-generated, same shape as venue QR tokens)
- `is_active boolean default true`
- `created_at`, `updated_at`
- Unique `(bonus_code_id, venue_id)`; composite tenant unique `(agency_id, event_id, id)`
- RLS: platform admin / agency members write; SELECT to authenticated within tenant; SECURITY DEFINER RPC handles anon claims

`public.event_bonus_codes` gets one new column: `scope text not null default 'event' check (scope in ('event','per_venue'))`. Existing rows default to `'event'` — no behaviour change.

`public.participant_point_awards` already keys bonus awards by `source_id`. For per-venue claims we set `source_id = event_bonus_code_venues.id` (still `award_type='bonus'`) so uniqueness naturally becomes once per (venue-bonus, passport). Analytics that group by bonus name join through the child row.

## RPCs (in `supabase/migrations-draft-per-venue-bonus/apply.sql`)

- `save_event_bonus_code(...)` — extend with `_scope` and `_venue_ids uuid[]`. When scope is `per_venue`: upsert bonus, then insert missing `event_bonus_code_venues` rows (server-generated tokens), and soft-deactivate rows for venues no longer selected (keep tokens so past claims still reference them).
- `claim_bonus_code(_token, _passport_token)` — after not finding `_token` in `event_bonus_codes`, look it up in `event_bonus_code_venues`. On hit: award full `points_value` from the parent bonus, insert `participant_point_awards` with `source_id = event_bonus_code_venues.id`, return same shape (`already_collected` when a row already exists for this passport + venue-bonus).
- `get_public_event_bonus_challenges(_hostname, _passport_token)` — for `per_venue` bonuses, treat "claimed" as "claimed at least once" so the public venue page's Bonus Challenge block reflects progress. (No change to shape.)

Existing prod hotfix chain (`extensions.digest`, `#variable_conflict use_column`, `NOT EXISTS` insert) is preserved.

## Admin UI

`src/components/event-bonus-codes-section.tsx`:
- Add a "Scope" toggle to the bonus form: **Event-wide** (default) / **Per-venue**.
- When Per-venue is selected, show a venue picker (checkbox list of the event's venues) with select-all / clear.
- List row shows a scope pill. Expanding a per-venue bonus reveals one `QrPreview` per participating venue (caption = "<Bonus name> — <Venue name>"), each with its own download.
- Event-wide QR still shown for event-scoped bonuses only.

`src/components/venue-tasting-qr-section.tsx` context (venue detail area in `admin.events.$eventId.tsx`): add a new "Bonus QR codes" block per venue that lists all per-venue bonus QRs active for that venue, so a venue owner can print them alongside their check-in and tasting QRs. Read-only (edits happen in Bonus Codes section).

## Public / claim flow

- `src/routes/collect.bonus.$token.tsx` — no changes; server RPC resolves both token types transparently.
- `src/routes/live.$subdomain.venues.$venueId.tsx` Bonus Challenge card — unchanged shape; `is_claimed` still comes from the RPC.

## Files touched

- New: `supabase/migrations-draft-per-venue-bonus/{apply.sql,README.md}`
- Edit: `src/components/event-bonus-codes-section.tsx`
- Edit: `src/routes/admin.events.$eventId.tsx` (pass venues to bonus section; add per-venue bonus block on each venue row)
- No changes to `collect.bonus.$token.tsx` or public venue page beyond what the RPC returns.

## Migration notes

- Draft only — user applies `apply.sql` in Supabase SQL editor.
- Backwards compatible: existing bonuses stay `scope='event'`; existing tokens and claims untouched.
- Rollback: drop `event_bonus_code_venues`, drop `scope` column, restore prior `claim_bonus_code` / `save_event_bonus_code` bodies (kept in README).

## Out of scope

- CSV export split of per-venue bonus claims (existing bonus export still works; grouping by venue is a follow-up).
- Bulk QR poster generation for per-venue bonuses (posters page keeps venue check-in + tasting only for now).
