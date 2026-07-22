## Fixes

### 1. Remove "Tasting QR" tab from the venue editor
`src/routes/admin.events.$eventId.tsx`
- Drop `"tasting"` from `VenueEditorTabKey` and from `VENUE_EDITOR_TABS`.
- Remove the `venueEditorTab === "tasting"` branch that renders `<VenueTastingQrSection>`.
- Remove the now-unused `VenueTastingQrSection` import.
- Leave the component file and its RPCs in place (harmless; other flows/bulk import still reference the concept).

### 2. Filter out disabled/deleted venues in the Bonus Points venue picker
`src/routes/admin.events.$eventId.tsx` around the `<BonusCodesSection venues={...}>` prop (line 4730):
- Pass only venues where `status === "active"` and `deleted_at == null`, keeping current shape `{ id, name }`.
- This also fixes the "Rowlee appears twice" symptom when a disabled duplicate exists alongside the active one.

### 3. Manage bonus codes: filter + delete
`src/components/event-bonus-codes-section.tsx`
- Add a small filter control above the list: "Active" (default) / "Disabled" / "All".
- Add a "Delete" button on each bonus row (destructive style, next to the existing Enable/Disable + Edit actions), behind a `window.confirm` warning that this permanently removes the code and its per-venue QR entries. Uses the existing supabase delete on `event_bonus_codes` (cascade removes `event_bonus_code_venues`); on success remove locally and toast.

### 4. Live Activity bar — add a gap between cycles so the header is reachable
`src/components/live-activity-bar.tsx`
- After the exit animation, unmount the bar for a "rest" window (~5s) before showing the next item. Implement as a third phase `"rest"` where the component returns `null`, then re-enters as `"in"`. Header icons become clickable during the rest window.
- Also make the button `pointer-events-auto` only during `in`/`out` phases so it never blocks taps when animating out.

### 5. Clone Event button does nothing
Root cause: the client calls `supabase.rpc("clone_event", …)` but the `public.clone_event` function only exists in `supabase/migrations-prod-clone-event/apply.sql` and was never applied to the live database. The RPC returns a PostgREST "function not found" error which is currently only surfaced via `toast.error`, and it appears the toast is being missed / suppressed in this flow.

Fix:
- Re-run the existing `supabase/migrations-prod-clone-event/apply.sql` in the Supabase SQL editor (the file is already in the repo and unchanged).
- In `src/routes/admin.events.index.tsx` `cloneEvent`, keep the toast but also `console.error` the raw error so future missing-RPC failures are diagnosable, and guard against the "empty data + no error" case by falling back to a reload + explicit toast.

No client-side clone logic change is required beyond that; the RPC is what's missing at runtime.

### 6. Prizes menu 404
`src/components/public-event-nav.tsx` (menu drawer, line 483): change `<Link to="/awards">` to `<Link to="/prizes">`. Grep confirms this is the only stale `/awards` link in nav; the route file is `src/routes/prizes.tsx`.

## Acceptance
- Venue editor no longer shows the "Tasting QR" tab.
- Adding/editing a bonus code shows only active, non-deleted venues (no duplicate Rowlee).
- Bonus Codes section has Active/Disabled/All filter and a working Delete button with confirmation.
- Live Activity bar hides between cycles; the top-left menu and top-right passport icons are tappable.
- After applying the clone SQL, clicking Clone → entering a name → OK creates a draft copy and navigates to it; errors surface via toast and console.
- Tapping "Prizes" in the drawer opens `/prizes` (no 404).
- Typecheck passes.