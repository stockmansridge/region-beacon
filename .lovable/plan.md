
## Goal

Make the public event home page (`/live/$subdomain/`) feel more vibrant and real-time by celebrating progress and showing what other visitors are doing right now.

Four additions, all on `src/routes/live.$subdomain.index.tsx`. No changes to saved data or admin flows.

## 1. Live Activity slide-down bar

A slim pill at the top of the page that slides down from above the hero, shows one recent scan for ~2 seconds, then slides up and swaps to the next. Rotates through the 3 most recent event-wide check-ins on a loop.

- Format: `🔥 Ben just checked in at Rowlee Wines!` (first name only, from `display_name` — split on space, take token 1; fall back to "Someone").
- If a scan also unlocked a reward, format becomes `Ben just unlocked Free Lunch at Rowlee Wines!`.
- Animation: slides in from `-translate-y-full` → `translate-y-0` (~300ms), holds 2s, slides out, next item slides in. CSS transitions on transform + opacity; single item mounted at a time via keyed React state.
- Placement: absolutely positioned at the top of the page, above the hero, `z-50`, pointer-events auto so it can be tapped to dismiss for the session.
- Data: new `supabase.rpc("get_public_event_recent_activity", { _hostname, _limit: 3 })` returning `{ first_name, venue_name, award_title | null, happened_at }`. Poll every 30s while the tab is visible; silently no-op if the RPC isn't deployed yet (so the UI ships before the migration lands).
- Styling: reuses `--event-nav-bg` / `--event-nav-fg` so it matches the event palette; small flame or spark icon on the left.
- If there are no recent scans in the last 24h, the bar simply doesn't render.

Drafts a new SQL file at `supabase/migrations-draft-public-recent-activity/apply.sql` creating the read-only RPC (joins checkins → passports for first name, → venues for name, → awards for the most recent award-unlock in the same window). Read-only, no PII beyond first name. Runs after the user applies it in the SQL editor; the UI degrades gracefully until then.

## 2. Confetti / streamers around the progress ring

Purely decorative SVG confetti sprinkled around the ring inside the summary card's left cell. Fixed positions, subtle bob animation via `@keyframes` in `src/styles.css` (`confetti-bob` — 2s ease-in-out infinite alternate, small translate + rotate). Colours pull from `--event-accent`, `--event-primary`, plus 2 neutral warm tones for contrast. Rendered only when `hasPassport` is true and `visited > 0` so it feels earned.

## 3. Trail-progress bar under the summary card

A new full-width progress row inside the summary card, below the ring/points grid:

- Label row: `Trail Progress`   · right-aligned `{pct}% COMPLETE`.
- Bar: rounded track using `--event-card-border` background, filled with `--event-button-primary-bg` to `pct = visited/total`.
- Subline: `Only {total-visited} {venueLabel} to conquer {eventName}! 🎉` when in progress, `Trail complete — nice work!` when done, hidden when no passport yet.

Uses the existing `visited` / `total` already computed from `usePassportHomeData`.

## 4. Replace "Start your passport / Tap to begin" tile with "points to next milestone"

The bottom-right tile in the summary card currently shows the tier glyph + "Tap to begin" when the visitor has no passport, or the tier label otherwise. Replace with:

- Big number: `{pointsToNext}` (derived from `pickNextReward(awards).points_required - points`).
- Sub-label: `TO NEXT MILESTONE`.
- Helper line below the grid (spanning full width, small muted text): `Visit {n} more {venueLabel} to enter the {rewardTitle} draw!` — hidden if there is no next reward.
- If the visitor has no passport yet, the tile instead shows `—` + `START YOUR PASSPORT` and remains a link to `/join` (keeps the current CTA working; the standalone "Start passport" button below is unchanged).
- If all rewards unlocked, tile shows `✓` + `ALL MILESTONES UNLOCKED`.

## Files touched

- `src/routes/live.$subdomain.index.tsx` — Live Activity bar component + hook, confetti overlay, progress bar section, replaced bottom-right tile.
- `src/styles.css` — `@keyframes confetti-bob` + `@keyframes live-activity-slide` utilities.
- `src/lib/use-passport-home-data.ts` — expose `pointsToNext` / `nextReward` conveniences (thin helper, no new fetch).
- `supabase/migrations-draft-public-recent-activity/apply.sql` + `README.md` — new read-only RPC for the activity bar. Draft only; user runs it in the Supabase SQL editor. UI hides itself if RPC returns an error.

## Out of scope

- No changes to database writes, admin pages, or the passport detail route.
- No websocket / realtime subscription — 30s polling is enough for the "last 3 scans" feel and avoids a Supabase Realtime channel per visitor.
- Confetti is decorative SVG, not a canvas library, to keep the bundle small.
