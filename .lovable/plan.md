## 1. Rename the public Prizes route from `/awards` to `/prizes`

- Rename `src/routes/live.$subdomain.awards.tsx` → `src/routes/live.$subdomain.prizes.tsx` and update its `createFileRoute("/live/$subdomain/awards")` string to `"/live/$subdomain/prizes"`.
- Update every internal link/reference that points at the old path:
  - `src/components/public-event-nav.tsx` (the "Prizes" nav item)
  - `src/routes/live.$subdomain.index.tsx` ("View Prizes" button, any nav)
  - `src/routes/passport.$token.tsx` (any link to `/awards`)
  - `src/components/next-reward-card.tsx` and any other file matching `/awards`
- Leave the legacy `/awards` slug alone unless a redirect is required; the tabbed pages inside the passport all use in-app `<Link>`s that we'll repoint. (No redirect needed since the page is only reached from our own nav.)

## 2. New "Bonus points available!" promo block

Matches the mock in the uploaded image: soft cream card, star medallion on the left, headline "Bonus points available!", two‑line body, and a "HOW IT WORKS" pill button on the right.

- New component: `src/components/bonus-points-promo.tsx`
  - Props: `subdomain` (for the `/prizes` link) and optional `variant` for token colours.
  - Renders as a `<Link to="/live/$subdomain/prizes" search={{ tab: "bonus" }}>` (or router-equivalent) so tapping the whole card opens the Prizes page on the new Bonus Points tab.
  - Uses existing `--event-*` design tokens (no hard‑coded colours) so it themes per event.
- Insert on **both** passport home surfaces, positioned immediately under the passport progress block and above `WhatsHappeningCard`:
  - `src/routes/passport.$token.tsx` (private token view) — near line 829 where `WhatsHappeningCard` mounts.
  - `src/routes/live.$subdomain.index.tsx` (public event home) — near line 710 where `WhatsHappeningCard` mounts.
- Only render the block when the event actually has bonus challenges. Reuse the existing public RPC `get_public_event_bonus_challenges` (already used on the venue page) via a small `useHasBonusChallenges(eventId)` hook, so events with no bonuses don't see an empty promo.

## 3. Prizes page — replace "My Entries" tab with "Bonus Points"

In the renamed `src/routes/live.$subdomain.prizes.tsx`:

- Change the tab state from `"rewards" | "entries"` → `"prizes" | "bonus"`.
- Rename tab labels: keep "Prizes"; replace "My Entries" with "Bonus Points".
- Support deep-link selection via a `?tab=bonus` search param (validated with `zodValidator` + `fallback`) so the promo block on the passport lands directly on that tab.
- Bonus Points tab content:
  - Fetch all active bonus challenges for the event via `get_public_event_bonus_challenges` (reusing the same call as the venue detail page).
  - Render each as a card showing: title, points value, kind badge (Points / Social), and — for `per_venue` scope — the participating venue names (or "Event-wide" for event-wide bonuses). Include short helper copy so visitors know what to do.
  - Empty state: "No bonus points have been added for this event yet."
- Keep the existing "Prizes" tab (current rewards list) exactly as-is.

### Small filter bar on the Bonus Points tab

A compact pill row above the list with three sort options:

- **A–Z** — sort by title, case-insensitive.
- **Points** — sort by `points_value` descending.
- **Proximity** — sort by distance from the visitor's current geolocation.
  - Uses `navigator.geolocation.getCurrentPosition` (best-effort, requested on demand when the user picks Proximity).
  - Compare against each bonus's associated venue coordinates (event-wide bonuses fall to the bottom). If geolocation is denied/unavailable, disable the Proximity pill with a subtle tooltip and fall back to A–Z.
- Default sort: A–Z. Filter state is local `useState` (no URL sync required).

## 4. Verification

- Typecheck via the harness build.
- Manually confirm on the preview:
  - Passport home shows the new "Bonus points available!" block under the progress card and above "What's happening now".
  - Tapping it opens `/live/$subdomain/prizes` with the "Bonus Points" tab pre-selected.
  - Tab labels are "Prizes" and "Bonus Points"; the Prizes tab still renders the existing reward cards unchanged.
  - Sort pills reorder the bonus list; A–Z is the default; Proximity requests location and reorders, or is disabled if denied.
  - Existing links that pointed to `/awards` now go to `/prizes`.

## Technical notes

- Search-param validation follows the standard `zodValidator(z.object({ tab: fallback(z.string(), "prizes").default("prizes") }))` pattern used elsewhere in the app.
- No DB migrations required — we're reusing `get_public_event_bonus_challenges` and existing venue coordinate data already returned from the public event RPCs.
- All colours come from `--event-*` tokens via `EventPaletteScope`; no hard-coded palette values in the new component.
