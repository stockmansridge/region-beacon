# GetStampd Points System — Release Check

Internal release notes for the points system rollout. Use this as the final
pre-launch checklist and as a quick reference for what shipped.

## What was added

- **Venue points** — each venue carries a `points_value` (default 0). Scanning
  a venue QR creates a passport stamp and awards venue points if > 0.
- **Bonus codes** — separate `event_bonus_codes` table. Scanning a bonus QR
  awards bonus points without creating a passport stamp.
- **Points ledger** — `participant_point_awards` is the source of truth for
  every awarded point (venue or bonus), with a unique constraint preventing
  duplicate awards per source.
- **Public passport progress** — public RPC returns total / venue / bonus
  points and stamp counts for the customer-facing event page.
- **Points-ranked leaderboard** — public RPC ranks participants by total
  points (tie-break on latest activity).
- **Admin Participants tab** — per-event participant table with totals,
  search, sort, and refresh.
- **Bonus claim drill-down** — per-participant view of which bonus codes
  were claimed, when, and how many points were awarded (from the ledger).
- **CSV exports** — participant totals CSV and bonus claims CSV, both with
  RFC 4180 escaping, UTF-8 BOM, and stable filename format.
- **QR hardening** — venue + bonus QR previews, copy/open/download/rotate.
- **Admin preview clarification** — explicit "Admin preview" copy on the
  preview route and `?preview=1` banner; warns that actions on published
  events may create real records.

## SQL files that must be applied (in order)

```
supabase/migrations-draft-points-system/01_points_system_foundation.sql
supabase/migrations-draft-points-system/02_points_claim_logic.sql
supabase/migrations-draft-points-system/03_public_passport_progress.sql
supabase/migrations-draft-points-system/04_leaderboard_points_ranking.sql
supabase/migrations-draft-points-system/05_admin_event_participants.sql
supabase/migrations-draft-points-system/07_qa_verification.sql
supabase/migrations-draft-points-system/09_bonus_code_drilldown.sql
supabase/migrations-draft-points-system/11_bonus_claims_export.sql
```

`07_qa_verification.sql` contains reference verification queries only — no
schema changes.

Note: these files live under `supabase/migrations-draft-points-system/` and
must be applied to the target Supabase project before the points system is
usable in production.

## Public flow summary

1. Customer opens the public event page on the event's subdomain.
2. Customer joins via `/join` — a passport is created.
3. Customer scans a **venue QR** → passport stamp + venue points (if any).
4. Re-scan of same venue → no duplicate stamp, no duplicate points,
   "already collected" message.
5. Customer scans a **bonus code QR** → bonus points awarded, no stamp.
6. Re-scan of same bonus code → no duplicate points, "already collected".
7. Public progress shows: total points, passport stamps (X / active venue
   count), venue points, bonus points.
8. Public leaderboard ranks by total points; bonus-only participants can
   appear; bonus points never increase stamp count.

## Admin flow summary

- **Event → Venues**: set `points_value` per venue; QR preview, copy link,
  open link, download PNG, rotate.
- **Event → Bonus Codes**: create / enable / disable codes with point
  values; same QR controls as venues. Disabled codes are not claimable but
  historical awards remain visible.
- **Event → Participants**: search, sort, refresh, totals (total / venue /
  bonus points, stamps, bonus codes claimed, latest activity, registered).
- **Drill-down**: per-participant bonus claims with code name, points
  awarded (from ledger), timestamp, and current status.
- **Preview customer page**: opens the real customer flow with an explicit
  "Admin preview" badge and warnings.

## Export summary

| Export | Filename | Source of points |
| --- | --- | --- |
| Participant totals | `getstampd-{event-slug}-participants-{yyyy-mm-dd}.csv` | Admin RPC totals (ledger-derived) |
| Bonus claims | `getstampd-{event-slug}-bonus-claims-{yyyy-mm-dd}.csv` | `participant_point_awards` (ledger) |

Both exports use RFC 4180 escaping, CRLF line endings, and a UTF-8 BOM for
Excel compatibility. Empty result sets do not download a file — an inline
message is shown instead.

## Permission model summary

**Anonymous (public) — allowed:**
- `redeem_checkin`
- `claim_bonus_code`
- `get_public_passport_progress`
- `get_public_leaderboard_by_domain`

**Anonymous — denied:**
- `get_admin_event_participants_with_points`
- `get_admin_participant_bonus_claims`
- `get_admin_event_bonus_claims_export`
- Direct `select` from `event_bonus_codes`
- Direct `insert` into `participant_point_awards`

**Authenticated platform admin / agency member for the event's agency:**
- All admin RPCs above.

**Authenticated user outside the event's agency:**
- Admin RPCs return forbidden / no rows.

All admin RPCs are `SECURITY DEFINER` and gate access internally on
platform-admin or agency-membership for the event's agency. Grants follow
the pattern `revoke all from public; grant execute to authenticated;` with
no `anon` grant.

## Known limitations

- No manual point adjustments yet.
- No prize draw / winner selection logic yet.
- No XLSX export yet.
- Admin preview for published events uses the real customer flow; actions
  can create real passports, check-ins, and points.
- Leaderboard tie-break approximates first-to-score using
  `latest_activity_at`.
- Migrations still live under `supabase/migrations-draft-points-system/`
  and must be applied to the target Supabase project before the system is
  usable in production.

## Manual test checklist summary

Use one published test event on an active subdomain with:

```
Venue A = 10 points
Venue B = 0  points
Bonus Code A = 25 points
```

In a fresh private browser session:

- [ ] Public event page shows the Collect points section.
- [ ] `/join` creates a passport.
- [ ] Scan Venue A → stamp + 10 points → total 10.
- [ ] Re-scan Venue A → no duplicate, "already collected".
- [ ] Scan Venue B → stamp, no points → total still 10.
- [ ] Scan Bonus Code A → +25 bonus, no stamp → total 35.
- [ ] Re-scan Bonus Code A → no duplicate, total still 35.
- [ ] Public progress: 35 total / 2 stamps / 10 venue / 25 bonus.
- [ ] Leaderboard: participant present, 35 pts, 2 stamps, ranked by total.
- [ ] Admin Participants row matches: 35 / 2 / 10 / 25 / 1 claim.
- [ ] Search, sort, refresh, latest activity, registered date all work.
- [ ] Drill-down shows Bonus Code A, 25 pts, timestamp, status.
- [ ] Change Bonus Code A from 25 → 100; drill-down still shows 25 pts.
- [ ] Participant totals CSV downloads with correct filename + 35 / 2 / 10 / 25 / 1.
- [ ] Bonus claims CSV downloads with correct filename + 25 pts row.
- [ ] After 25 → 100 change, bonus claims CSV still shows 25 pts for old claim.
- [ ] Venue QR: preview, copy, open, download PNG, rotate all work.
- [ ] Bonus QR: preview, copy, open, download all work.
- [ ] Disabled bonus codes: not claimable publicly; historical data preserved.
- [ ] No spurious "Could not render QR code." messages.
- [ ] Admin preview: clear "Admin preview" copy; published-event warning;
      unpublished-event copy; `?preview=1` banner on live route.
- [ ] Disabled / deleted venues: historical check-ins and points preserved;
      excluded from public active venue count.
- [ ] Browser console clean across admin event page, QR renders, public
      event page, join, venue scan, bonus scan, leaderboard, exports.
- [ ] Build / type check passes.
