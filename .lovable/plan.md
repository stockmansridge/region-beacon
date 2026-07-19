## Rewards page vibrancy update

Bring the public Prizes page (`/live/$subdomain/awards`) up to the mockup: live activity bar, celebratory header, per‑prize progress bars, entry counts, draw dates, and "Top Prize"/"Popular" badges, plus a Rewards / My Entries tab toggle.

### 1. Header + tabs
- Replace the current "Prizes" heading block with a two‑tab pill (`REWARDS` / `MY ENTRIES`). Both tabs show the same list; My Entries filters to prizes where the visitor is already eligible (`is_eligible === true`).
- If the visitor has no passport, My Entries shows a friendly empty state with a link to `/join`.

### 2. Live activity banner
- Dark green banner directly under the tabs: 🎉 icon, "LIVE DRAM ACTIVITY" label, and "N new entries in the last hour!" copy, with a small avatar stack of first initials + `+N` overflow.
- Data: reuse `get_public_event_recent_activity(_hostname, _limit)` with `_limit = 20` and a 1‑hour window filter on the client (rows already include `happened_at` and `first_name`). Polls every 30s, mirroring `WhatsHappeningCard`.
- If the RPC is unavailable or count is 0, hide the banner.

### 3. "You're In the Draw!" hero strip
- Centered confetti glyphs (SVG, purely decorative — no libs) + display heading using the event font, sub‑copy "Complete challenges to earn more points and increase your chances to win."
- Heading text swaps to "Keep collecting points!" when the visitor is not yet eligible for any prize, and to "Start a passport to enter" when there is no passport.

### 4. Prize cards (redesigned)
Each `AwardCard` becomes a full‑bleed card:
- Cover image at top (existing `image_url`) with a corner ribbon:
  - `TOP PRIZE` for the award with the highest `points_required`.
  - `POPULAR` for the award with the highest `eligible_count` (ties → higher `sort_order` first). Skip both badges if there is only one active prize.
- Title + "YOU'RE IN!" pill when `is_eligible`. Otherwise show the existing status label ("Keep collecting" etc.) styled as a soft pill.
- Description (unchanged).
- Progress row: `min(passport_points, points_required) / points_required POINTS` with a filled progress bar using `--event-primary`. Anonymous visitors see `0 / N POINTS`.
- Two‑column metadata row:
  - **Current entries**: `eligible_count`
  - **Draw date**: formatted `draw_date` (see §6) or "TBA" if unset.
- Footer encouragement line, chosen from award state: eligible → "Your odds improve with bonus challenges!"; needs points → "Keep exploring to earn more points!"; needs all locations → "Visit every stop to enter."; anonymous → "Start a passport to join the draw."

### 5. Passport point context
The existing `get_public_event_awards` already returns `passport_points`, `points_remaining`, and `is_eligible`, so no schema change is needed for progress or the My Entries filter.

### 6. Optional draw date
- Add nullable `draw_date date` to `public.event_awards` and expose it in both admin (`get_event_awards_admin`, `save_event_award`) and public (`get_public_event_awards`) RPCs.
- Admin UI: new "Draw date (optional)" date input in the award editor inside `admin-event-rewards.tsx`.
- Public UI: renders "2 Nov 2026" style (`toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' })`); "TBA" when null.
- Ship as a draft SQL file at `supabase/migrations-draft-award-draw-date/apply.sql` (never auto‑applied) plus a feature‑detected loader path so the page keeps working before the migration runs.

### 7. Preserve existing behavior
- Route path, meta title ("Prizes"), palette scoping, `PublicEventNav`, and `PoweredByGetStampd` footer stay identical.
- Bottom tab bar entry keeps its current label.
- Loading, error, and empty states use the same palette tokens as today — no hard‑coded colors.

### Technical details

- Files touched
  - `src/routes/live.$subdomain.awards.tsx` — rewrite body: tabs, live banner, hero strip, new `AwardCard`, derive badges by scanning the list.
  - `src/lib/event-awards.ts` — extend `PublicEventAward` and `AdminEventAward` with `draw_date: string | null`; add to `SaveAwardInput` and `saveAward` payload.
  - `src/components/admin-event-rewards.tsx` (or the current admin prizes component) — add draw date input; pass through to `saveAward`.
  - `supabase/migrations-draft-award-draw-date/apply.sql` — new draft: `alter table` + updated RPC bodies for `get_event_awards_admin`, `save_event_award`, `get_public_event_awards` (keep signatures, add column at the end of the return list).
- Feature detection: wrap the draw‑date read in the same pattern used for `require_postcode` — if the RPC returns "column does not exist" or the row lacks the field, default to `null` and render "TBA".
- Polling: reuse the existing 30s interval pattern from `WhatsHappeningCard`; cancel on unmount.
- No new packages. Confetti / celebration visuals are SVG + CSS only.

### Out of scope
- The mockup's "WHAT'S NEW?" footer block is a design annotation, not part of the shipping UI — do not add it.
- No changes to draw/void logic, admin analytics, or bonus‑code flow.
