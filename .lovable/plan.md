
## Goal

Bring the public venue detail page closer to the mockup and give organisers a new "emotive" copy block per venue (with a font selector) — plus refresh the "What's New" list at the bottom of the venue page so it reflects what actually changed now that per-venue bonus points exist.

---

## 1. New per-venue field: Emotive text + font

**Data (draft migration `supabase/migrations-draft-venue-emotive/apply.sql`)**
- `alter table public.venues add column emotive_text text` (nullable, max ~280 chars via check).
- `alter table public.venues add column emotive_font_key text` — enum-like key resolved in code (e.g. `caveat`, `dancing-script`, `pacifico`, `kalam`, `shadows-into-light`, plus `serif-italic` as an on-brand fallback). Default `null` → resolver falls back to the event-level default.
- Extend `get_public_venue_by_id` / `get_public_venues_by_domain` RPCs to return `emotive_text` and `emotive_font_key`.
- Grants unchanged (existing venue policies already cover reads/writes).

**Branding page (`src/routes/admin.events.$eventId_.branding.tsx`)**
- Add "Default emotive font" selector under the existing font pickers (uses `heading_font_family`/`font_family` pattern from `event_branding`). Persist as `event_branding.emotive_font_key`.
- Ships a small preview swatch per option using the same font-loader as `src/lib/event-fonts.ts` (extend that registry with the script fonts; load via `<link>` in `__root.tsx` per Tailwind v4 rules).

**Venue editor (`src/routes/admin.events.$eventId.tsx`, venue detail block)**
- New textarea "Emotive intro (optional)" **directly above** the venue Description field.
- Small font dropdown next to it, defaulting to the event branding default; "Use event default" is the first option.
- Helper text: e.g. "Short, punchy line displayed in a script font at the top of the venue page. Keep it warm and human."

**Public venue page (`src/routes/live.$subdomain.venues.$venueId.tsx`)**
- Render `emotive_text` between the Visited pill and the description, styled italic in the selected script font, with the event's accent-tinted colour. Wrap in a `<blockquote>` for semantics.
- If empty, render nothing (no placeholder).
- Resolve font: venue.emotive_font_key ?? event_branding.emotive_font_key ?? `serif-italic` (the current default look).

---

## 2. Points highlight (mockup: "+10 POINTS")

Small addition to the same public venue page: show the venue's `points_value` as a bold accent-coloured badge to the right of the Visited/Not-visited pill, mirroring the mockup. Uses existing `points_value` already on the venue RPC — no schema change.

---

## 3. Offer + bonus polish (visual only, matches mockup)

- Offer card: add a small "OFFER UNLOCKED" eyebrow above the offer title when the visitor has visited; otherwise "OFFER".
- Bonus challenge card: group multiple challenges into a single card with dividers (matches mockup) instead of separate cards. Existing data unchanged.
- No copy or logic changes to bonus claim flow.

---

## 4. "What's New" list at the bottom of the venue page

Replace the current 4 bullets in the mockup with an updated set that reflects the shipped changes, including per-venue bonus points:

1. Warm, human copy at the top of each venue (new emotive intro).
2. Points earned per visit are front-and-centre.
3. Bonus challenges can now be per-venue — each is its own mini-quest with its own points.
4. Offers unlock visually once you've checked in.
5. Confetti + progress celebrate every stamp on your passport.

Rendered as a small "What's new" card at the bottom of the venue detail page, styled with existing card tokens, dismissible via `localStorage` key `venue-whats-new-v2`.

---

## Technical notes

- No breaking changes; migration is additive.
- New script fonts loaded via `<link>` tag in `src/routes/__root.tsx` head (Tailwind v4 rule — no remote `@import` in `styles.css`).
- Font registry lives in `src/lib/event-fonts.ts`; extend with a `script` group so both branding + venue selectors share it.
- Typecheck must pass; RPC signature bumps require regenerating Supabase types after applying the draft migration.
- Migration stays in `supabase/migrations-draft-venue-emotive/` — user applies manually in SQL editor, same pattern as recent drafts.

---

## Out of scope (ask if wanted)

- Changing the confetti behaviour itself.
- Per-venue background image / colour override.
- Rich-text (bold/links) inside the emotive block — plain text only for v1.
