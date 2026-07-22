## Scope

Six polish items on public passport / prizes / activity surfaces.

### 1. Hashtags: strip leading `#`
File: `src/routes/live.$subdomain.prizes.tsx` (bonus card, ~line 626-629).
The `<Hash />` icon already renders a `#`. Split `bonus.social_hashtags` on whitespace/commas, strip any leading `#` from each token, and render as space-separated tags (e.g. user enters `#cargoRoad #wine` → chip shows `# cargoRoad wine`). Keep the AtSign row unchanged, but similarly strip a leading `@` from `social_location` for symmetry.

### 2. "View all" → correct Prizes URL
The route was renamed `/awards` → `/prizes` but three links still point to `/awards`:
- `src/routes/passport.$token.tsx` line 1234 (Prizes section "View all")
- `src/routes/live.$subdomain.index.tsx` line 717 ("View prizes" button)
- `src/components/next-reward-card.tsx` line 25

Update each `to="/awards"` → `to="/prizes"`.

### 3. Live activity bar: cap to 3 cycles
File: `src/components/live-activity-bar.tsx`.
Add a `cyclesShown` counter that increments each time `index` advances. Once it reaches 3, set `dismissed=true` so the banner stops appearing for the rest of the session. Loading fresh data does not reset the counter.

### 4. Remove "View all" from What's Happening Now
File: `src/components/whats-happening-card.tsx` lines 180-186 — delete the `<Link to="/leaderboard">View all</Link>`. Header becomes just the "What's Happening Now" title.

### 5. Group activity by venue + show up to 3 recent venues
The card currently shows only the single most-recent check-in. Change display to:
- Group `recent_checkins` by `venue_name` in order of most recent visit.
- Take the top 3 venues.
- For each venue, list up to the last 3 first names, joined naturally (`Jonathan, Steve & Lisa visited Stockman's Ridge Wines`). Single visitor keeps existing "just visited" phrasing with relative time; multiple visitors show "recently visited" + relative time of the latest.
- Explorers-today and bonus-code items remain below (unchanged behaviour).

Bump the RPC `LIMIT` from 5 to 15 so grouping has enough rows, and update the client fallback (`loadRecentCheckins`) to request 15 too.

### 6. Prize-unlock event (🎉)
When a visitor crosses a prize threshold, show a pop-down banner ("🎉 You unlocked <Prize Name>!") and surface it in the What's Happening Now feed for everyone.

Approach:
- **Data source**: `participant_point_awards` logs an entry each time a passport becomes eligible for an award (award_type = `prize`, with `metadata.award_id` / `metadata.award_name`). If existing rows don't include `award_name`, join to `event_awards` on `metadata->>'award_id'`.
- **New draft migration** `supabase/migrations-draft-public-happening-prize-unlocks/apply.sql`:
  - Extend `get_public_event_happening_now` to add `recent_prize_unlocks` (last 3, past 24h): `{ first_name, prize_name, points_awarded, happened_at }`.
  - Extend `get_public_event_recent_activity` (used by the live bar) to also include prize-unlock rows in its unified feed, ordered by `happened_at`.
- **Client `LiveActivityBar`**: render prize unlocks with a 🎉 emoji instead of 🔥, and a message like `Jonathan just unlocked Grand Prize Draw!`. Reuses the 3-cycle cap.
- **`WhatsHappeningCard`**: render a new list item for the most recent prize unlock (🎉) alongside the venue-group items and bonus-code item. Visual order: prize unlock → venue groups → explorers → bonus.
- **Own-passport banner**: on the passport home, after a successful check-in, compare pre/post `awards` list (via `usePassportHomeData`) and if any award flipped from `is_eligible=false → true`, show a one-time celebratory 🎉 drop-down (reuse `RingConfetti` + a small dismissible toast).

Migration requires manual application (`supabase/migrations-draft-public-happening-prize-unlocks/apply.sql`) in the Supabase SQL editor before item 6 is fully live.

## Files touched

- `src/routes/live.$subdomain.prizes.tsx` — hashtag/location cleanup
- `src/routes/passport.$token.tsx` — `/awards` → `/prizes`
- `src/routes/live.$subdomain.index.tsx` — `/awards` → `/prizes` + own-passport unlock detection
- `src/components/next-reward-card.tsx` — `/awards` → `/prizes`
- `src/components/live-activity-bar.tsx` — 3-cycle cap, prize-unlock rendering (🎉)
- `src/components/whats-happening-card.tsx` — remove View all, group by venue, add prize-unlock item (🎉)
- `supabase/migrations-draft-public-happening-prize-unlocks/apply.sql` (+ README) — extend both RPCs

## Open question

For item 6, should the 🎉 drop-down on the visitor's own passport trigger only on the exact check-in that crossed the threshold, or also on any subsequent page load until dismissed?
