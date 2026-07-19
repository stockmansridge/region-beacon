## Scope

Six changes across the public passport UI, the bonus code claim path, the admin Events list, and the public Venues page.

### 1. Rename "Rewards" → "Prizes" (public pages)

Rename every user-facing "Rewards" label on public routes to "Prizes". Keep the URL path `/awards` and the internal Rewards data model unchanged (only labels change).

Files:
- `src/components/public-event-nav.tsx` — nav + drawer entries.
- `src/routes/live.$subdomain.awards.tsx` — page heading, hero kicker, tab labels, empty-state copy.
- `src/routes/passport.$token.tsx` and `src/routes/live.$subdomain.index.tsx` — any "Rewards" copy on cards, buttons ("View rewards" → "View prizes"), progress labels.
- `src/components/event-awards-section.tsx` and other components rendered under those routes — button/label sweep.

Leave the admin-side already renamed in an earlier turn as-is.

### 2. Rename "Bonus Challenge" → "Bonus Points" (public)

Files:
- `src/routes/live.$subdomain.venues.$venueId.tsx` — section header, badge captions, empty-state copy.
- `src/components/passport-stamp-grid.tsx` — legend line becomes `= Bonus Points available here`.
- Any other public copy referencing "Bonus Challenge".

Admin copy stays unchanged.

### 3. Per-venue bonus behaviour + analytics

Verify the intended behaviour end-to-end and fix whatever is currently wrong:

- **Intended:** scanning a per-venue bonus QR at venue A awards the bonus's `points_value` to that participant, and can be claimed once per (participant, venue). Scanning the code at venue B awards another `points_value`, up to N times for N linked venues. A bonus scan does **not** create a `checkins` row and does **not** mark venue A/B stamps as visited.
- **Verification steps before editing:**
  1. Re-read `supabase/migrations-draft-per-venue-bonus/apply.sql` `claim_bonus_code` to confirm per-venue path uses `source_id = ebv.id` (unique per venue), and event-wide uses `source_id = bc.id`. If the deployed function differs, ship a production migration that matches.
  2. Confirm `/collect/bonus/$token` only calls `claim_bonus_code` and never triggers `redeem_checkin`.
  3. Confirm `get_public_event_bonus_challenges` `is_claimed` is scoped per `ebv.id` for per-venue rows so claiming at venue A does not flip venue B to "claimed".
- **Analytics gap to close:** the admin Analytics page currently exposes "Total check-ins" but no "Bonus scans" surface. Add a new `Stat` card `Bonus scans` counting rows in `participant_point_awards` with `award_type = 'bonus'`, and give it a drilldown modal showing bonus name, participant, venue (if per-venue), points, and timestamp. Existing "Total check-ins" continues to reflect only `checkins` rows so the two are cleanly separated.

Files:
- `supabase/migrations-prod-per-venue-bonus-verify/apply.sql` — only created if the deployed function needs to be re-aligned; otherwise skip.
- `src/routes/admin.analytics.tsx` — new stat + drilldown.

### 4. Share button opens only the event root URL

Both share entry points must share only the public event root (`${window.location.protocol}//${window.location.host}/`) — never `window.location.href`, which leaks the passport token when shared from `/passport/$token`.

Files:
- `src/components/public-event-nav.tsx` — replace `url = window.location.href` with the origin-only URL for both `navigator.share` and the mailto fallback.
- `src/routes/passport.$token.tsx` — same treatment on any Share affordance in the private passport header.

### 5. Clone event (admin Events list)

Add a "Clone" action beside each event row.

- UI: on `src/routes/admin.events.index.tsx`, add a Clone button per row. On click, `window.prompt` for a new name, prefilling `"${original.name} (copy)"`. Block submit if the name matches an existing event in the same agency (case-insensitive) or is empty.
- Data: new SECURITY DEFINER RPC `public.clone_event(_source_event_id uuid, _new_name text)` that:
  - Checks caller is `is_platform_admin` OR `is_agency_admin` for the source event's agency.
  - Inserts a new `events` row copying every column except `id`, `name` (use `_new_name`), `slug` (generated), timestamps, and `status` (force `'draft'`).
  - Copies dependent rows the customer expects to travel with an event: `venues`, `venue_qr_codes` (new tokens), `event_bonus_codes` and `event_bonus_code_venues` (new tokens), `event_checkin_settings`, `event_faq`, `prize_rules` / awards config, branding fields, announcements.
  - Explicitly does NOT copy: `passports`, `visitors`, `checkins`, `participant_point_awards`, `visitor_consents`, `venue_tasting_qr_claims`, `event_award_draws`, `prize_draw_results`, `export_logs`.
  - Returns the new `event_id`; the UI navigates to `/admin/events/:id`.

Files:
- `supabase/migrations-prod-clone-event/apply.sql` — the RPC + grants (`authenticated`).
- `src/routes/admin.events.index.tsx` — Clone button, prompt, RPC call, toast, navigate.

### 6. Venues page spacing

On `src/routes/live.$subdomain.venues.index.tsx`, the `<ul>` of venue cards has no top gap from the `PassportProgressCard` (only `space-y-4` between children). Add `mt-4` to the `<ul>` so the first venue card sits the same distance below the progress card as the cards sit from each other. Both blocks are already inside the same `max-w-md` container, so widths already match — no width change needed, only vertical rhythm.

## Verification

- Public nav shows "Prizes"; `/awards` still resolves.
- Venue page shows "Bonus Points" section title and legend.
- Scanning a per-venue bonus at 3 venues yields `3 × points_value` on the passport total, three rows in `participant_point_awards` with `award_type='bonus'`, zero new `checkins` rows, and three entries in the new Analytics "Bonus scans" drilldown.
- Share from `/passport/$token` produces `https://<sub>.getstampd.com.au/` (no token).
- Clone Event from the admin list creates a draft event with venues, bonus codes (new tokens), FAQ, prize rules, branding — and zero participants / check-ins / awards.
- First venue card gap on `/venues` matches inter-card gap.
- `tsgo` passes.
