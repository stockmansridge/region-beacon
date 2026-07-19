
## Goal

Match the mockup (`image-19.png`) on the passport summary card:
- Merge the standalone **Trail Progress** section into the top summary card so the ring, points, milestone and progress bar live in one block.
- Replace the static "More prizes ahead / stay tuned" corner tile with an interactive **points-to-next-reward** tile.

Scope: `src/routes/passport.$token.tsx` only (the same layout is not on `live.$subdomain.index.tsx`, per user's screenshots this change is for the private passport view).

## Layout

```text
┌─────────────────────────────────────────┐
│  ◯ 4/6           │   90                 │
│  CELLAR DOORS    │   POINTS EARNED      │
│                  │───────────────────── │
│                  │   2                  │
│                  │   TO NEXT MILESTONE  │
│                  │   Visit 2 more …     │
├─────────────────────────────────────────┤
│  Trail Progress          67% COMPLETE   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░                    │
│  Only 2 cellar doors to conquer …       │
└─────────────────────────────────────────┘
```

## Changes

**1. Merge Trail Progress into the summary card**
- Remove the standalone `<TrailProgress …/>` render (currently the section right below the summary card).
- Inside the summary card, append a full-width row under the existing 2-column grid containing:
  - "Trail Progress" heading + "N% COMPLETE" badge
  - The same thin progress bar (using `--event-button-primary-bg`)
  - The "Only N … to go / conquer" line
- Keep `TrailProgress` as an internal helper by inlining its body (or converting to a `TrailProgressRow` sub-component rendered inside the card) so the visual style stays consistent.
- Separator between the grid and the new row: same `1px solid var(--event-card-border)` used between the right-column cells.

**2. Turn the bottom-right tile into a points-to-next-reward tile**
Replace the `{tierGlyph} {tierTitle} / {tierSub}` block with a stat-style tile that mirrors "Points earned":

- Big number: `nextAward.points_remaining` (falls back to "—" while `awards == null`; shows `0` styled as "Ready!" when `points_remaining === 0`).
- Small caps label: `TO NEXT MILESTONE` (or `TO NEXT REWARD` if no milestone framing fits — pick one, use it consistently).
- Helper line under it: `Visit N more <venue-label> to enter <award title>` when the next award is stops-based, or `Earn N more points to enter <award title>` when it is points-based. Use `nextAward.title` for the reward name.
- States:
  - Loading (`awards == null`): "—" / `TO NEXT MILESTONE` / "loading…"
  - No awards configured (`awards.length === 0`): keep current "More prizes ahead / stay tuned" copy as the fallback — nothing else to count toward.
  - All unlocked (`nextAward == null && unlockedAwards.length > 0`): "0" / `ALL PRIZES UNLOCKED` / "You're in every draw 🎉"
  - Trail complete: same as all unlocked if applicable.

**3. Cleanup**
- Remove now-unused `tierGlyph`, `tierTitle`, `tierSub` variables (or repurpose only what the fallback state needs).
- Leave the downstream `RewardsSection` unchanged — it already lists all rewards with per-reward "N more to enter".

## Acceptance

- Summary card visually matches `image-19.png`: ring on left, points top-right, milestone-countdown bottom-right, trail progress bar spanning full width below.
- No duplicate progress bar under the card.
- Bottom-right tile shows a live number that decreases as the user earns points/stamps, and updates the helper copy to name the specific next reward.
- Typecheck passes; no visual regression on the landing/`live.$subdomain.index.tsx` page (untouched).
