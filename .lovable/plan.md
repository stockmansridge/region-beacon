## 1. Rename "Awards / Rewards" → "Prizes" (copy-only)

Global relabel across admin and public UI. No route renames, no DB/RPC/type renames — internal identifiers (`awards`, `AwardsPage`, `EventAwardsSection`, RPC names, table names, `/awards` URL) stay so nothing else breaks.

Files:
- `src/routes/admin.events.$eventId.tsx`
  - Tab label `{ key: "awards", label: "Awards" }` → `"Prizes"`.
  - Section `title="Awards & rewards"` → `"Prizes"`; update its description ("Create the prizes and draw entries…").
  - Any inline copy referencing "Awards" in the leaderboard-tiers description → "Prizes".
- `src/components/event-awards-section.tsx`
  - Buttons: "Add reward" / "Add award" → **"Add prize"**.
  - Section headings: "Draw history" / "Awards draw history" → **"Prize draw history"**.
  - Loading / empty / error strings mentioning "awards" → "prizes".
  - Dialog titles ("Draw a winner", "Void draw") stay; surrounding "award" copy → "prize".
- `src/routes/live.$subdomain.awards.tsx`
  - Page heading "Rewards & prizes" → **"Prizes"**.
  - Subcopy and empty-state ("No rewards have been added…") → prize wording.
  - `head()` title "Awards" → "Prizes".
- `src/routes/awards.tsx` `head()` title "Awards — GetStampd" → "Prizes — GetStampd" and matching description.
- `src/components/next-reward-card.tsx` "Next reward" label → **"Next prize"**.
- `src/routes/live.$subdomain.index.tsx` any user-facing "reward(s)" strings in the summary tile → "prize(s)".
- `src/routes/passport.$token.tsx` summary-tile copy referencing rewards/awards → prize wording (variable names untouched).

No changes to `event-awards` lib, migrations, or route paths.

## 2. Show the event QR code in the Public Address card (Overview tab)

In `src/routes/admin.events.$eventId.tsx`, inside the Public Address section, when `subdomainRow.status === "active"` and a subdomain is set, render a `<QrPreview>` that encodes `https://<subdomain>.getstampd.com.au` (the public event home). Add:

- Small heading "Event QR code".
- `<QrPreview value={publicUrl} downloadName={`event-${subdomain}-qr`} pngButtonLabel="Download event QR (PNG)" caption="Event: <event name>" />` (see item 3 for the new `caption` prop).
- Short helper text: "Print or share this to send visitors straight to your event home page."

Hidden while pending / not claimed.

## 3. Add plain-Arial name caption under every single QR code

Extend `src/components/qr-preview.tsx` with a new optional prop:

```ts
caption?: string; // plain name shown directly under the QR image
```

Render below the `<img>` (and above the existing `poster.venueName` block, which stays for A4 poster metadata) as:

```tsx
{caption && (
  <div style={{ fontFamily: "Arial, sans-serif" }} className="text-sm font-medium text-foreground">
    {caption}
  </div>
)}
```

Then pass `caption` from every single-QR call site:

- `src/routes/admin.events.$eventId.tsx` venue QR previews (2 sites, lines ~2530 and ~4327): `caption={v.name}`.
- `src/components/event-bonus-codes-section.tsx` (line ~450): `caption={<bonus code label / name>}`.
- `src/components/venue-tasting-qr-section.tsx` (line ~617): `caption={<tasting QR label>}`.
- New event QR in Public Address (item 2): `caption={event.name}`.

No A4 poster layout is generated — this is a plain text label under the on-screen QR.

## 4. Poster stamp value must reflect the current per-QR entry value

Symptom: on `/admin/events/$eventId/posters`, the venue poster still shows the previous `X stamps per scan` after the value is updated in Overview.

Root cause: `admin.events.$eventId_.posters.tsx` loads `venue_qr_codes.entry_value` once on mount into `qrByVenue` and never refetches, so leaving the tab and coming back with a stale page (or Back/Forward cache) shows the old number.

Fix in `src/routes/admin.events.$eventId_.posters.tsx`:

1. Move the QR-codes fetch into a named async function and re-run it on `window` focus / `visibilitychange` (`document.visibilityState === 'visible'`).
2. Add a small "Refresh" button in the page header that re-runs the same fetch and updates `qrByVenue`.
3. Ensure `venuePosterDataById` recomputes (already keyed on `qrByVenue`).
4. Sanity: `stampValue: qr?.entry_value ?? 1` stays, and `src/components/posters/venue-poster.tsx`'s `stampsCopy` already reads from `data.stampValue`, so no poster-render change needed once the fetch is fresh.

No schema changes.

## 5. Public home CTA: "View offers & rewards" → "View Prizes"

`src/routes/live.$subdomain.index.tsx` line 604: change button text `View offers & rewards` → **`View prizes`**. Link target (`/awards`) unchanged.

## Verification

- Typecheck passes (`tsgo`).
- Admin tab shows "Prizes"; section header, "Add prize", and "Prize draw history" render.
- Public `/awards` page title and heading say "Prizes"; home CTA says "View prizes".
- Public Address card shows Event QR when active, hidden otherwise.
- Each single QR (venue, bonus, tasting, event) shows the QR name in Arial directly beneath it.
- Update a venue's stamp value in Overview → open Posters → the venue poster's "N stamps per scan" reflects the new value after auto-refresh or clicking Refresh.
