# Draft: rewards, points & prize draw

Status: **DRAFT — NOT EXECUTED**

Backend-first plan for tier display, weighted entries, configurable QR
values, and an auditable random prize draw. No SQL in this folder has
been run against any environment. Nothing here is wired into the UI yet.

## Files in this draft bundle

1. `01_qr_and_checkin_entry_value.sql`
   Adds `entry_value int` to `public.venue_qr_codes` (default 1, check
   1..100) and to `public.checkins` (default 1, check 1..100). Backfills
   existing rows to 1.

2. `02_redeem_checkin_with_entry_value.sql`
   Patches `public.redeem_checkin` to copy the QR's `entry_value` into
   the newly-inserted `checkins.entry_value`. Duplicate / idempotent
   branches are unchanged. Historic check-ins keep their snapshotted
   value even if the QR is later rotated or repriced.

3. `03_get_public_leaderboard_with_tiers.sql`
   Patches `public.get_public_leaderboard_by_domain(text)` to project
   `stamps int`, `points int`, `tier text`, `is_completed boolean`.
   Tier is derived from active `min_checkins` reward_rules for the
   event, with a safe Bronze/Silver/Gold/Complete default when no rules
   exist. No PII added.

4. `04_prize_draw_results.sql`
   New append-only audit table `public.prize_draw_results`. Stores
   winner identifiers + cached `winner_display_name` and admin-only
   `winner_email`, the `seed`, `total_eligible_passports`,
   `total_entries`, `selected_entry_number`, `selected_hash`, full
   `pool_snapshot jsonb`, and `drawn_by` (auth.uid()). Append-only via
   RLS + grants — only the SECURITY DEFINER RPC writes.

5. `05_admin_prize_draw_rpcs.sql`
   Admin-only RPCs:
     * `admin_get_prize_draw_pool(_event_id, _prize_rule_id)` — returns
       per-passport summary (visitor display name + weighted entries).
     * `admin_draw_prize_winner(_event_id, _prize_rule_id, _seed)` —
       **deterministic hash-based weighted draw** (no `setseed()` / no
       `random()`). Each passport is expanded into `entries` tickets;
       each ticket gets `sha256(seed || ':' || passport_id || ':' ||
       ticket_index)`; the ticket with the lexicographically smallest
       hash wins. Same `(seed, pool)` always picks the same winner on
       any server / Postgres version. Pool is snapshotted into
       `prize_draw_results.pool_snapshot` so the draw stays auditable
       after future check-ins.

6. `06_verification.sql`
   Hand-run verification queries covering: default `entry_value = 1`,
   snapshot immutability when QR value changes, `redeem_checkin`
   snapshot behaviour, public leaderboard return shape (tier + points,
   no PII), weighted pool counts, single-draw audit row, seed
   reproducibility, and non-admin rejection.

## Order of application (later, after review)

```
01_qr_and_checkin_entry_value.sql
02_redeem_checkin_with_entry_value.sql
03_get_public_leaderboard_with_tiers.sql
04_prize_draw_results.sql
05_admin_prize_draw_rpcs.sql
-- 06_verification.sql is hand-run only, never auto-applied
```

`03` depends on `01` (uses `checkins.entry_value`).
`05` depends on `01`, `04`, and `pgcrypto` (for `digest()`).

## Snapshot principle (important)

`checkins.entry_value` is **snapshotted** at check-in time from
`venue_qr_codes.entry_value`. Re-pricing or rotating a QR later does
**not** retroactively change historic entries. This protects visitors
from value changes after they've scanned and gives admins an honest
audit trail.

## Special / offer value — recommendation

Three candidate locations were considered:

| Option | Pros | Cons |
| --- | --- | --- |
| On the QR (this draft) | Simplest; one source of truth; check-in already references QR | A "special" must have its own QR code |
| On `venue_offers` | Co-located with the offer copy | Offers aren't redeemed today; needs a redemption flow + extra join in leaderboard hot path |
| As an `event_rule` | Reusable across venues | Most complex; no observed need at MVP |

**Recommendation:** put the `entry_value` on the QR for MVP. A "special"
becomes "a venue QR with `entry_value > 1`". This requires no new
tables, fits the existing rotate/reveal model, and `venue_offers`
remains free for marketing copy (independent of points). Re-evaluate
when the richer `venue_offers` redemption flow lands.

## Tier model

For MVP, tier is derived per-event from active `reward_rules` where
`rule_type = 'min_checkins'`, sorted by ascending `threshold`. The
visitor's `stamps` (distinct venues stamped) maps to the highest
satisfied threshold's `reward_label`. If no `min_checkins` rules
exist, fall back to **Bronze (3) / Silver (5) / Gold (8 or all
venues) / Complete (all venues)** — matching the existing
client-side defaults in `src/lib/passport-rewards.ts`.

The leaderboard RPC computes tier server-side so all clients (public
page, admin tools, future emails) agree.

## Privacy & security

- All public RPCs remain `SECURITY DEFINER` with explicit
  `search_path = public`; projections never include `email`, `mobile`,
  `postcode`, `full_name`, `visitor_id`, `passport_id`, or token hashes.
- Admin prize-draw RPCs are gated by role checks **inside** the
  function body. Service role keys are never used in client code.
- `prize_draw_results` records `drawn_by = auth.uid()` and the seed, so
  any draw can be re-run offline by an auditor.
- Winner display in admin UI may include `first_name`, `last_initial`,
  and `email` to allow contact — but only inside the admin shell.
  Public leaderboard never exposes winners' contact details.

## Rollback notes

Each file lists rollback statements in a trailing comment block. The
order is the reverse of apply order. `01` is additive and safe to keep
even if higher-numbered files are reverted (entry_value columns default
to 1).

## Risks

- **Leaderboard tier query cost**: tier resolution does a small join per
  passport against active reward_rules. For events with thousands of
  visitors and dozens of rules this is still cheap, but we should index
  `reward_rules(event_id, is_active, rule_type, threshold)`.
- **Snapshotted entry_value drift**: if an admin sets a QR to 5, a
  visitor scans, then admin lowers to 2 — the visitor keeps 5. This is
  intentional but should be surfaced in the QR settings UI ("Changes
  apply to future check-ins only").
- **Weighted random**: deterministic, hash-based — `sha256(seed || ':'
  || passport_id || ':' || ticket_index)`, smallest hash wins. No
  `setseed()` / no `random()` / no session state. Each ticket's hash is
  an i.i.d. uniform draw from a 2^256 space, so win probability is
  exactly `entries / total_entries`. Reproducible offline by any
  auditor with the seed and the stored `pool_snapshot`.

## Proposed (non-implemented) frontend changes

- **Admin venue page → QR settings**: add an `entry_value` numeric
  input (1..100, default 1) next to the existing reveal/rotate
  controls. Warn that changes apply to future check-ins only.
- **Public leaderboard page**: render `tier` as a coloured chip and
  `points` next to `stamps` when settings allow.
- **Visitor passport page**: show tier badge + points (already shows
  default tiers from `passport-rewards.ts`).
- **Admin event detail → Prize draw panel**: list active `prize_rules`,
  show entrant pool size, "Draw a winner" button (writes to
  `prize_draw_results`), and a history table of previous draws with
  seed + drawn_by.
- **Admin winner result panel**: shows winner's name + email +
  entries-at-time-of-draw + seed. Copy-able for organiser follow-up.

None of the above are wired in this draft.
