## Branding editor fixes

### 1. Diagnose why saved colours don't render on the public page (Chrome)

Investigate before fixing — no code changes until root cause is confirmed on event `evt-bg1beh2o0w`.

Working hypotheses to test, in order:
- **`ColorRoleRow` sync race.** The local `text` state is kept in sync via `useEffect([displayValue])`, where `displayValue = value || resolved`. When the user types a hex, `value` changes → `displayValue` changes → effect overwrites `text`. In Chrome this can clobber an in-flight edit if the user tabs quickly to Save. Also `onInput` on the colour picker fires on every drag frame and calls `onChange` with the picker's current value, which can overwrite a manually-typed hex that hasn't blurred yet.
- **Save payload dropping fields.** Check what the top-level Save actually PUTs — the header lists ~30 semantic fields; if any are read from stale state (e.g. `branding` snapshot instead of the in-form draft), Chrome's autofill/blur order could cause a partial save.
- **Chrome placeholder confusion.** `<input placeholder={resolved}>` renders the resolved hex in `text-[#94A3B8]` (grey). Users read that as "the saved value" and assume it stuck; in Firefox the same text may render darker. Confirm by loading the event, reading the row from Supabase, and comparing to what the field displays.
- **Brand Kit precedence.** `resolveEventTheme` picks `pickHex(column) ?? kit?.value ?? palette`. If the event has `brand_kit_key` set and the organiser cleared a column back to blank expecting their custom colour, the kit's colour wins on the public page even though the editor shows "Inherited". Confirm by inspecting the row.

Deliverables from the investigation:
- Read the `events` row for `evt-bg1beh2o0w` and compare each colour column to what the public page renders.
- Then apply the minimal fix(es) the evidence supports. Likely candidates:
  - Drop `onInput` on the colour picker (keep `onChange` only) so the picker doesn't fight the text input.
  - Debounce or gate the `useEffect` sync so it only runs when the field isn't focused.
  - Show the resolved hex as a distinct "Resolved: #XXXXXX" chip under the input instead of as the placeholder, so users can tell empty-vs-set at a glance in every browser.
  - If Brand Kit is the culprit, add an explicit "Clear brand kit" affordance or make column values with `""` still win over kit when the organiser has explicitly reset.

### 2. Fix logo circle clipped top/bottom in Chrome

Check the round logo container in the branding preview and in the public header/hero. Likely cause: the wrapper is in a flex row without `shrink-0` / `aspect-square`, so Chrome's flex sizing squashes it vertically while the `img` inside uses `object-contain`. Fix by pinning both width and height (or `aspect-square shrink-0`) on every round logo container:
- `src/components/trail-landing.tsx` (hero logo)
- `src/components/public-event-nav.tsx` (header avatar)
- `src/routes/admin.events.$eventId_.branding.tsx` (preview + upload thumbnail)

### 3. Add a colour control for the "Digital Passport" cover label

Today the eyebrow above the event title on the cover is:
- Public page: styled with `--event-hero-accent` (already themable).
- Branding preview (`TrailLanding`): hardcoded to the `goldColor` prop.

Changes:
- In `TrailLanding`, paint the subtitle with `var(--event-hero-accent, ...)` so the preview matches the live page.
- Rename the existing "Hero accent colour" `ColorRoleRow` in `admin.events.$eventId_.branding.tsx` to something explicit like **"Cover eyebrow label colour ("Digital Passport")"** with helper text that names the element. No new DB column needed — `hero_accent_color` already exists and is what the public page reads.

### 4. Move Event Logo + Cover Image uploads to the left column

In `src/routes/admin.events.$eventId_.branding.tsx`, the right column is currently:

```text
[ Live preview ]
[ Event logo upload ]
[ Cover image upload ]
```

Move both `AssetUploadCard`s (logo + cover) out of the right column and into the left editor column, placed at the top above the Brand section. The right column keeps only the pinned `TrailLanding` live preview. Preserve all existing props (`persistAssetPath`, `removeAsset`, etc.) — this is a JSX relocation only.

### Acceptance
- Colours chosen in the branding editor match what renders on the public event page in Chrome and Firefox for event `evt-bg1beh2o0w`.
- Round logo renders as a full circle in Chrome on the public page, header, and branding preview.
- A clearly-labelled colour row controls the "Digital Passport" cover label, and changing it updates both the preview and the live page.
- Event Logo and Cover Image upload cards appear in the left column; the right column shows only the live preview.
- Typecheck passes.
