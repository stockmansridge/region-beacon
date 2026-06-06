# Tasting QR Codes — DRAFT

Adds the optional secondary "Tasting QR Codes" layer per venue.

## Apply order

1. `01_venue_tasting_qr_codes.sql` — main table + RLS
2. `02_venue_tasting_qr_claims.sql` — claim ledger + RLS (admin read only)
3. `03_rpcs.sql` — admin read/save/delete + public `claim_venue_tasting_qr`
4. `05_verify.sql` — should return 5 trues

## Plan gating

`save_venue_tasting_qr_code` enforces that the agency plan is `regional`,
`pro_region`, or `enterprise`. Lower plans get error code
`plan_required: Tasting QR Codes are available on Regional and Pro Region plans.`
and the admin UI surfaces an upgrade prompt instead.

## Points integration

`claim_venue_tasting_qr` writes both `venue_tasting_qr_claims` and
`participant_point_awards` (`award_type = 'tasting'`). Existing leaderboard /
totals queries that sum `participant_point_awards` pick up tasting points
automatically.

## Idempotency

`(tasting_qr_id, passport_id)` is unique. A second scan of the same QR by the
same passport returns `already_collected = true` with `points_awarded = 0`.

## Out of scope (follow-ups)

- Honouring `scan_limit_per_passport` > 1 (currently treated as 1 via unique).
- CSV export of tasting claims via `export_event_csv`.
