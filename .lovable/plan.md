
## Goal

Reduce branding to 8 semantic colour roles, drive every public passport page through one central theme helper, add a live preview and non-blocking contrast warnings on the Branding page. Keep existing events working via backward-compatible mapping.

## The 8 semantic roles

| Role | CSS var | Used for |
|---|---|---|
| Page background | `--event-page-bg` | Outer page background |
| Card / surface bg | `--event-card-bg` | Cards, dialogs, list rows, panels |
| Primary brand | `--event-primary` | Primary buttons, accents, links, visited stamps |
| Primary button text | `--event-primary-fg` | Text/icons on primary buttons |
| Main text | `--event-text` | Headings, venue names, labels, body copy, leaderboard names, FAQ Qs |
| Muted text | `--event-muted` | Helper text, descriptions, metadata, timestamps, secondary labels |
| Accent / highlight | `--event-accent` | Map pins, badges, highlights, secondary brand colour |
| Border / divider | `--event-border` | Card borders, dividers, input borders |

Note: `--event-text` collapses today's `--event-heading` + `--event-body` into a single role. Old vars (`--event-heading`, `--event-body`, `--event-visited`, `--event-pin`) continue to be emitted as aliases (`var(--event-text)` / `var(--event-primary)` / `var(--event-accent)`) so existing public pages keep rendering.

## Schema changes (migration)

Add to `public.event_branding`:
- `text_color text` (main text)
- `muted_text_color text` (muted text)
- `border_color text` (border / divider)
- `primary_text_color text` (primary button text, distinct from `primary_color`)

Keep existing columns (`primary_color`, `accent_color`, `page_background_color`, `card_background_color`, `palette_key`, `page_background_key`) untouched for backward compatibility. New saves write the new columns; reads fall back to palette-derived values if unset.

## Central theme helper

New `src/lib/event-theme.ts`:

```ts
export type EventTheme = {
  pageBg: string; cardBg: string;
  primary: string; primaryText: string;
  text: string; muted: string;
  accent: string; border: string;
};

export function resolveEventTheme(input: {
  palette_key?, primary_color?, accent_color?,
  page_background_color?, card_background_color?,
  text_color?, muted_text_color?, border_color?, primary_text_color?,
}): EventTheme;

export function themeCssVars(t: EventTheme): React.CSSProperties;
// emits --event-page-bg, --event-card-bg, --event-primary, --event-primary-fg,
// --event-text, --event-muted, --event-accent, --event-border
// + legacy aliases: --event-heading, --event-body, --event-visited, --event-pin
```

`EventPaletteScope` is refactored to call `resolveEventTheme` + `themeCssVars` so every public page already wrapped in it picks up the new model with zero per-page changes.

## Public page audit (text colour pass)

For each file under `src/routes/live.*`, `src/routes/passport.*`, `src/routes/checkin.*`, `src/routes/tasting.*`, `src/routes/collect.bonus.*`, `src/routes/t.$agencySlug.*`, `src/routes/scan.tsx`, plus `trail-landing.tsx`, `trail-shell.tsx`, `public-event-nav.tsx`, `public-legal.tsx`, `event-map-section.tsx`, `collect-points-section.tsx`, `venue-public-profile-dialog.tsx`:

- Replace `text-slate-*`, `text-gray-*`, `text-stone-*`, `text-muted-foreground`, raw hex text colours, and inherited-only text with one of:
  - `style={{ color: 'var(--event-text)' }}` (or `text-[var(--event-text)]`) for main copy
  - `style={{ color: 'var(--event-muted)' }}` for helper / metadata
- Borders → `var(--event-border)`. Card backgrounds → `var(--event-card-bg)`.
- Primary buttons: `bg-[var(--event-primary)] text-[var(--event-primary-fg)]`. Secondary buttons: `bg-[var(--event-card-bg)] border-[var(--event-border)] text-[var(--event-text)]`.

Heading-specific weight/size stays via Tailwind; only colour comes from the theme.

## Branding editor changes (`admin.events.$eventId_.branding.tsx`)

- Replace the current scattered text colour inputs with exactly 8 colour controls matching the roles above (palette presets still offered as quick fills).
- Remove / hide controls that don't drive anything consistent (any one-off text-tint fields).
- Persist all 8 to `event_branding` on save. Legacy fields written for back-compat where they overlap.
- Add a **Live preview** card rendered with `EventPaletteScope` using the in-progress form values — same component path as production, so what the admin sees is exactly what customers get. Preview contains: H1, body paragraph, muted helper line, primary button, secondary button, sample card, sample venue row, sample leaderboard/reward row.
- Add **contrast warnings** using WCAG relative-luminance ratio (<4.5 AA for normal text, <3 for large):
  - main text vs page bg
  - main text vs card bg
  - muted text vs card bg
  - primary button text vs primary brand
  Each warning is a small inline amber notice next to the affected control: *"Low contrast: this text may be hard to read on the public passport."* Non-blocking — save still works.

## Backward compatibility

`resolveEventTheme` precedence per role:
1. New explicit column (e.g. `text_color`) if set & valid hex
2. Curated palette value (when `palette_key` resolves)
3. Custom palette derived from `primary_color`/`accent_color`
4. Default palette (`classic_vineyard`)

So events with no new columns yet render identically to today.

## Files touched (estimate)

- **New**: `src/lib/event-theme.ts`, `src/lib/contrast.ts`, migration under `supabase/migrations/`
- **Edited (core)**: `src/components/event-palette-scope.tsx`, `src/lib/event-palettes.ts` (export shim), `src/routes/admin.events.$eventId_.branding.tsx`
- **Edited (audit, colour-only)**: ~15 public route/component files listed above
- **Type updates**: wherever `Branding` is typed, add 4 new optional fields

## Out of scope

- No layout/spacing/typography redesigns of public pages — colour token swap only.
- No blocking validation on save (warnings only, per spec).
- No removal of palette_key / curated palettes — they still work and act as quick fills.

## Verification

- `bun run build` clean.
- Branding page renders 8 controls + live preview; tweaking each control updates the preview live.
- Toggling colours to a known-bad pair (e.g. white-on-white) surfaces the contrast warning; save still succeeds.
- An existing event with no new columns loads unchanged on `/passport/...`, `/live/.../venues`, `/live/.../leaderboard`, `/live/.../faq`, `/checkin/...`.
- Grep confirms no `text-slate-`, `text-gray-`, `text-muted-foreground` left in audited public files.
