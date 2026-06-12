# Public Home / Passport Redesign Plan

## Scope decision

Apply the new layout to the **public Home route** (`src/routes/live.$subdomain.index.tsx`) — it is the page customers land on after scanning the event poster QR. The existing `passport.$token.tsx` page stays as-is for now (it already works as the deep passport view linked from the new Home).

Rationale: the reference image is a landing/overview experience (hero + progress + stamps + next reward + CTA + bottom nav). That's the role of Home. Touching `passport.$token.tsx` in the same pass would double the surface area and risk regressing check-in/QR flows.

## Route & nav mapping (non-breaking)

Keep route file structure and `redeem_checkin` untouched. Only change labels/icons and the order in `PublicEventNav`:

| Slot | Label | Route | Notes |
|---|---|---|---|
| 1 | Home | `/` | unchanged |
| 2 | Passport | `/passport` (resolves to current token via existing `useCurrentEventPassport`; falls back to `/join`) | replaces "Map" in the bottom 5 |
| 3 | Rewards | `/awards` | existing awards route |
| 4 | Offers | `/offers` | existing offers route |
| 5 | More | drawer (Map, Leaderboard, FAQ, Terms, Privacy) | move Map + Leaderboard into the existing "More" drawer |

No routes added or removed. Map and Leaderboard remain reachable from More.

## Sections to build on Home

1. **App shell** — drop the `max-w-md` boxing on Home only; use full-width with inner padding so the page feels immersive on mobile. Keep `EventPaletteScope` wrapper so all `--event-*` tokens still drive the look.
2. **Hero header** — existing menu (left) + logo (center) + passport icon (right) already in `PublicEventNav`. Add greeting line ("Hi {firstName}!" when passport known, else "Welcome") + event headline using `font-family: var(--event-font)`. Hero image uses existing `event.cover_path`.
3. **Progress summary card** — extend `PassportProgressCard`:
   - large circular ring (visited/total)
   - points earned (sum from points ledger via existing `get_passport_points_summary` if present, else fall back to stamp count × default — TBD in implementation; if no RPC, hide points row)
   - "Next reward: {name}" derived from configured awards (skip if none)
4. **Passport stamp grid** — new `PassportStampGrid` component. Source: `loadPassportStampState(token)` (already returns all venues with `is_stamped`). Renders tiles with venue initial/logo; stamped tiles get a check + accent ring; unvisited tiles are muted. If no passport yet, render a "Start passport" CTA tile grid placeholder.
5. **Next reward card** — uses configured awards via existing `event-awards` lib. If 0 configured → omit card entirely (no Bronze/Silver/Gold defaults). Show requirement text + progress bar + "N to go".
6. **Primary CTA** — full-width branded "View offers & rewards" → `/awards` (or `/offers` if no awards configured).
7. **Bottom nav** — update `PublicEventNav` 5 slots as above with lucide icons (Home, Ticket, Gift, Tag, Menu).

## Data sources (existing only)

- Event: `get_public_event_by_domain` ✓
- Venues: `get_public_event_venues` ✓
- Passport + stamps: `loadPassportStampState` ✓
- Awards: existing `event-awards` lib (need to check if a public-by-event RPC exists; if not, reuse what `awards.tsx` already calls)
- Points: check whether a points summary is exposed publicly. If not exposed, the points line on the progress card will be **omitted** rather than faked.

No new tables. No changes to `redeem_checkin`, points, or awards logic.

## Files to change

- `src/routes/live.$subdomain.index.tsx` — restructure body
- `src/components/passport-progress-card.tsx` — expand into full progress card (ring + points + next reward hint)
- `src/components/public-event-nav.tsx` — bottom nav reshuffle + icons
- **NEW** `src/components/passport-stamp-grid.tsx` — stamp tiles grid
- **NEW** `src/components/next-reward-card.tsx` — next reward progress card
- Possibly small additions to `src/lib/passport-stamps.ts` if points need to be surfaced

No changes to: `passport.$token.tsx`, check-in routes, RPCs, migrations.

## Open questions before I code

1. **Points exposure** — is there an existing public RPC that returns the visitor's points total for an event by passport token? If not, OK to omit the "X points earned" line for now? (Avoids faking data.)
2. **Awards source** — should the "Next reward" card read the same awards list that `/awards` shows publicly, or is there a configured-rewards-with-thresholds table I should use? Confirm which lib/RPC.
3. **Nav change scope** — OK to swap Map out of the bottom 5 and into "More" globally on the public event nav? Or keep Map in bottom 5 and drop Leaderboard instead?

Once you confirm those, I'll implement in one pass and verify on mobile preview.
