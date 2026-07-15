## Changes to public event home page (`src/routes/live.$subdomain.index.tsx`)

### 1. Show full welcome copy in the hero
The hero paragraph currently uses `line-clamp-2` (line 417), so welcome copy longer than two lines is truncated with `…`. Remove `line-clamp-2` so the full copy is displayed. Keep the existing text shadow / color styling.

### 2. Make the "Start your passport – tap to begin" tile clickable
In the summary card, the bottom-right tier tile shows:
- Title: `Start your passport`
- Subtitle: `tap to begin`

when the visitor has no passport yet. Today it's plain text. Wrap that tile in a `<Link to="/join">` (using TanStack Router `Link`, same route the primary CTA already uses) only when `!homeData.hasPassport && canRegister`. In other states it stays as static text (no link).

- Preserve existing layout, colours, and typography.
- Add a subtle `hover:opacity-90` and a proper `aria-label="Start your passport"`.
- When `canRegister` is false (terms not configured), leave the tile non-interactive to match the disabled primary CTA behaviour.

### 3. Add "View Venues & Offers" button under "View prizes"
Immediately after the `View prizes` `<Link>` section (currently ending at line ~638), add a second `<Link to="/venues">` styled identically (same className, same inline style tokens `--event-button-primary-bg` / `--event-button-primary-fg`, same rounded-full h-12 shadow). Label: `View venues & offers` (use the event's plural venue label when available, e.g. `View wineries & offers`).

The `/venues` route already renders `PublicTrailTabs` with the `venues` tab active by default, so no changes to the tabs component or the venues route are required — linking to `/venues` satisfies "slider defaulted to the Venue tab".

## Out of scope
- No admin, database, RLS, or server-function changes.
- No changes to `/offers`, `/awards`, or the tabs component.
- No changes to branding, palette, or fonts.

## Test steps
1. On a public event home page with a long `welcome_copy`, confirm the hero shows the full text (no `…`).
2. Without a passport, tap the "Start your passport / tap to begin" tile in the summary card → navigates to `/join`.
3. With a passport already registered, that tile shows the next-prize / tier text as today and is not a link.
4. Scroll to the "View prizes" button — a matching "View venues & offers" button sits directly below and navigates to `/venues` with the Venues tab active.

## Rollback
Revert the single file `src/routes/live.$subdomain.index.tsx`.
