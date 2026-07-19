## Goal

Add a "What's Happening Now" card to the public event home page (`/live/$subdomain/`) that surfaces recent trail activity — recent check-ins, how many people are exploring today, and recent bonus-code unlocks — powered by an expanded read-only RPC. Style matches the mockup: warm card, emoji leader icons, bold subject + light context per row, "VIEW ALL" affordance in the header.

## 1. Expand the recent-activity RPC

Draft a new SQL file at `supabase/migrations-draft-public-happening-now/apply.sql` that creates `public.get_public_event_happening_now(_hostname text)` returning a single JSON payload:

```
{
  "recent_checkins": [
    { "first_name": "Lisa", "last_initial": "D", "venue_name": "Canobolas Wines", "happened_at": "..." }
  ],
  "explorers_today": 18,
  "recent_bonus": [
    { "first_name": "Someone" | "Ben", "venue_name": "Stockman's Ridge", "points_awarded": 25, "happened_at": "..." }
  ]
}
```

Details:
- `recent_checkins`: last 5 event-wide check-ins in the past 24h. First name from `visitors.first_name` (fall back to "Someone"), plus first letter of last name when available.
- `explorers_today`: distinct passports with at least one check-in since local midnight (uses event `timezone` when set, otherwise UTC).
- `recent_bonus`: last 3 bonus-code claims in the past 24h from the `bonus_code_claims` table (or equivalent — script will introspect and pick the existing one; if none exists, this array is empty and the UI hides that row group).
- `security definer`, `stable`, granted to `anon, authenticated`. No PII beyond first name + last initial.
- Existing `get_public_event_recent_activity` stays in place; new RPC is additive so we can ship UI + SQL independently.

README explains apply steps and notes graceful UI degradation until applied.

## 2. New `WhatsHappeningCard` component

Add `src/components/whats-happening-card.tsx`:

- Fetches `get_public_event_happening_now` on mount, polls every 30s while tab is visible, silently no-ops if the RPC isn't deployed yet.
- Layout matches mockup:
  - Header row: bold "What's Happening Now" on the left, small "VIEW ALL" link on the right (links to `/live/$subdomain/leaderboard` since that's the closest existing activity surface — no new route created).
  - Up to 3 rows total, chosen in priority order:
    1. Most recent check-in — 🔥 icon, `**{First L.}** just visited **{Venue}**` + relative time ("2 mins ago").
    2. Explorers today — 🍷 icon (event uses wine palette; use a generic sparkle for non-wine themes via a small event-agnostic mapping, defaulting to ✨) — `**{n} people are exploring** the trail today` + "Join them!" subline. Hidden when count < 2.
    3. Most recent bonus claim — ⭐ icon, `Someone found a **hidden bonus** at **{Venue}**!` + `{points} bonus points awarded`. Hidden when no bonus data.
- Styling uses existing event tokens (`--event-card-bg`, `--event-card-border`, `--event-card-heading`, `--event-card-muted`) so it themes per event. Rounded-3xl, subtle border, matches other summary cards on the page.
- Renders nothing when all three rows would be empty (fresh event, no activity in last 24h) so it doesn't sit on the page looking dead.

## 3. Slot into the home page

Edit `src/routes/live.$subdomain.index.tsx`:

- Import `WhatsHappeningCard`.
- Render `<WhatsHappeningCard subdomain={subdomain} eventId={event.event_id} venueLabelPlural={...} />` in the main content column, directly under the summary/progress card and above `<NextRewardCard />` (around line 709). This is the "celebrate progress → see what others are doing → see what's next" flow requested previously.
- No change to the existing top slide-down `LiveActivityBar` — the two surfaces complement each other (slide-down = ephemeral, card = persistent glanceable summary). If the user later wants to consolidate, that's a follow-up.

## 4. Out of scope

- No new route for "VIEW ALL" — link points at the existing leaderboard page.
- No websocket/realtime subscription — 30s polling is enough and avoids per-visitor channels.
- No changes to admin, database writes, or the passport detail route.
- No changes to the existing `LiveActivityBar` or `get_public_event_recent_activity` RPC.

## Files touched

- `supabase/migrations-draft-public-happening-now/apply.sql` + `README.md` — new read-only RPC (draft; user applies in SQL editor).
- `src/components/whats-happening-card.tsx` — new component.
- `src/routes/live.$subdomain.index.tsx` — mount the card in the home layout.
