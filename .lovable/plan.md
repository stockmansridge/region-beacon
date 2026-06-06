## Goal

Add an optional secondary "Tasting QR Codes" layer attached to each venue. Regional / Regional Pro plans can create/edit them; lower plans see a locked upsell card. Scanning a tasting QR awards points to the participant's passport (additive to normal venue check-in), feeding the existing GetStampd points ledger and leaderboard.

## 1. Database — new draft `supabase/migrations-draft-venue-tasting-qr/`

### `01_venue_tasting_qr_codes.sql`
- `public.venue_tasting_qr_codes` with the columns from the brief (`agency_id`, `event_id`, `venue_id`, `label`, `description`, `points int default 10`, `status text default 'active' check in ('active','disabled')`, `qr_token text unique`, `scan_limit_per_passport int`, `starts_at`, `ends_at`, `created_at`, `updated_at`, `deleted_at`).
- Composite FK `(agency_id, event_id, venue_id) → venues(agency_id, event_id, id)` to keep tenant integrity (matches existing `venues_tenant_unique`).
- Indexes on `(venue_id, status)`, `(event_id)`, unique `(qr_token)`.
- `tg_set_updated_at` trigger.
- Grants: `authenticated` SELECT/INSERT/UPDATE/DELETE; `service_role` ALL; no `anon`.
- RLS enabled, `deny_all` restrictive baseline, then:
  - `_select`: platform admin OR `is_agency_member(uid, agency_id)`.
  - `_write`: platform admin OR `is_agency_admin(uid, agency_id)` AND `deleted_at is null`. Plan gating enforced inside the save RPC (not RLS).

### `02_venue_tasting_qr_claims.sql`
- `public.venue_tasting_qr_claims` per brief; composite FK to passports `(agency_id, event_id, passport_id)` mirroring existing `checkins` pattern.
- `unique (tasting_qr_id, passport_id)` partial where `deleted_at is null` not needed (claims aren't soft-deleted).
- Index on `(event_id, claimed_at desc)`, `(passport_id)`.
- RLS: select for platform admin OR agency member. No public write policies — only via the SECURITY DEFINER claim RPC.

### `03_rpcs.sql` (all SECURITY DEFINER, `search_path = public`)
- `get_venue_tasting_qr_codes(p_event_id uuid, p_venue_id uuid)` — admin read with claim counts (left join + count) for the venue card.
- `save_venue_tasting_qr_code(p_id, p_event_id, p_venue_id, p_label, p_description, p_points, p_status, p_scan_limit_per_passport, p_starts_at, p_ends_at)` — upsert. Verifies admin role, validates fields (label non-empty, 0 ≤ points ≤ 10000, end ≥ start, venue belongs to event/agency), enforces plan via `getstampd_event_plan_key(event_id)` (or equivalent helper used by `pricing` draft — we'll inspect and reuse). Returns row. On insert generates `qr_token` via `gen_random_bytes(24)` urlsafe-base64 (same pattern as `rotate_venue_qr` in `34_rpcs_admin.sql`).
- `delete_venue_tasting_qr_code(p_id)` — soft delete (`deleted_at = now()`, `status = 'disabled'`).
- `claim_venue_tasting_qr(p_qr_token text, p_passport_id uuid)` — public-safe:
  - Look up QR by token, must be `status='active' AND deleted_at IS NULL`.
  - Validate venue active, passport belongs to same event/agency, window check.
  - Insert claim with `on conflict (tasting_qr_id, passport_id) do nothing` → if no row inserted return `{status: 'already_claimed', ...}`. Else `{status: 'awarded', points, label, venue_name}`.
  - Also insert into `participant_point_awards` if that table exists (per `migrations-draft-points-system`) so leaderboard totals reflect tasting points — keyed by `(event, passport, type='tasting', source=tasting_qr_id)` for idempotency.
- Grants: admin RPCs to `authenticated` only; `claim_venue_tasting_qr` to `authenticated` AND `anon` (public claim screen works without login).

### `04_extend_get_public_venue_by_slug.sql` (optional)
Not required for MVP — public claim resolves by token directly.

### `05_verify.sql` + `README.md`
Standard checklist.

## 2. Plan gating

Inspect `supabase/migrations-draft-pricing/01_getstampd_venue_limits.sql` for the existing plan-key helper. Reuse it. If a helper like `getstampd_event_plan_key(event_id) returns text` exists, gate to `plan_key in ('regional','regional_pro')`. If not, we'll add a small SQL helper in `03_rpcs.sql` reading from `agencies.plan_key` (or the existing source of truth — confirmed during implementation).

UI also reads the plan via existing hook (look for current pricing hook in `src/lib/getstampd-pricing.ts`).

## 3. Admin UI

New component `src/components/venue-tasting-qr-section.tsx` mounted inside the existing venue edit area (likely `src/routes/admin.venues.tsx` or wherever venue edit lives — confirmed during implementation).

**Eligible plan UI:**
- Card titled "Tasting QR Codes" with helper copy.
- Table/list of tasting QRs: label, points, status badge, claim count, actions (Edit, Disable/Enable, Download QR, Copy link, Delete).
- "Add Tasting QR" button opens dialog (shadcn `Dialog`) with form: label*, description, points (default 10), starts_at, ends_at, scan_limit_per_passport, status.
- QR download/print uses existing `src/lib/qr-poster.ts` pattern; claim URL is `https://<host>/tasting/<token>`.
- All errors surface `formatSupabaseError` (same pattern as FAQ/map sections).

**Locked plan UI:**
- Same card frame, dimmed, with feature description, example, "Available on Regional and Regional Pro" badge, and an "Upgrade to unlock" button linking to existing pricing/upgrade route.

## 4. Public claim route

New route `src/routes/tasting.$qrToken.tsx`:
- Resolves current passport from session (reuse `useCurrentEventPassport` pattern from `src/lib/use-current-event-passport.ts`).
- If no passport, redirects to join flow with `?next=/tasting/<token>`.
- Calls `claim_venue_tasting_qr` RPC; renders one of three states (awarded / already_claimed / unavailable) using event palette scope so branding matches.
- Buttons: "Back to my passport", "Back to event".

## 5. Points/leaderboard integration

- Claim RPC writes both `venue_tasting_qr_claims` and `participant_point_awards` (idempotent via composite source).
- Existing leaderboard RPC (`get_public_leaderboard_by_domain`) already sums `participant_point_awards` (per points-system draft) — no change needed if that's already deployed; otherwise we note it as a follow-up.
- Venue check-in / stamp flow untouched.

## 6. Files

**New SQL** (`supabase/migrations-draft-venue-tasting-qr/`)
- `01_venue_tasting_qr_codes.sql`
- `02_venue_tasting_qr_claims.sql`
- `03_rpcs.sql`
- `05_verify.sql`
- `README.md`

**New code**
- `src/components/venue-tasting-qr-section.tsx`
- `src/components/venue-tasting-qr-dialog.tsx` (form)
- `src/routes/tasting.$qrToken.tsx`
- `src/lib/use-venue-tasting-qr.ts` (admin read hook)
- `src/lib/use-event-plan.ts` (small helper if not already present)

**Edited**
- Venue edit route (TBD after inspection) — mount `<VenueTastingQrSection venueId=... />`.
- `src/routeTree.gen.ts` — add the new route.

## 7. Out of scope
- Multi-claim windows beyond `scan_limit_per_passport=1` default (column stored, not yet honoured beyond unique constraint).
- CSV export of tasting claims (add later when `export_event_csv` is extended).
- Inline editing of QR token; tokens are immutable once issued (admin can disable + re-create).

## 8. Required follow-up (user action)
Apply the four new draft SQL files in order via the Lovable Cloud migration tool. The feature is dormant until SQL is applied (admin section will surface a friendly empty state and the public route will return "unavailable").
