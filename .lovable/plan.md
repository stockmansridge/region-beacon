# Branding editor — pinned preview + reliable color fields

Scope: `src/routes/admin.events.$eventId_.branding.tsx` (single route file, plus the small `ColorRoleRow` / `HeroOverlayCard` helpers inside it). No DB, RLS, or business-logic changes.

## 1. Pin the live preview so it's always visible while editing

Today the right column uses `lg:sticky lg:top-6`, which works only above the `lg` breakpoint AND only while the surrounding grid row is tall enough. On common laptop widths and on tablets the preview scrolls off screen as soon as you expand a section like Brand or Cards.

Change the two-column layout so the preview panel is a true always-visible pane on any screen ≥ `md`:

- Wrap the page in a flex row (`md:flex md:gap-6`) instead of a CSS grid whose row-height defeats `sticky`.
- Left column (form): `md:flex-1 md:min-w-0 md:overflow-y-auto md:max-h-[calc(100vh-var(--admin-header-h,80px))] md:pr-2`. This is the ONLY scroller — the form scrolls, the preview does not.
- Right column (preview + uploads): `md:w-[420px] md:shrink-0 md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-var(--admin-header-h,80px))] md:overflow-y-auto`. Preview stays fixed to the viewport regardless of which section is open.
- On mobile (< `md`) keep today's stacked order but add a floating "Show preview" pill button, bottom-right, that scrolls to `#live-preview` (no new state machine, no drawer). Give the preview card `id="live-preview" scroll-mt-4`.
- Remove `lg:order-2 order-1` swap — with a fixed side pane it's no longer needed.

Acceptance:
- On a 1280×800 laptop viewport, open Brand → Page → Cards → Buttons in turn. The preview card stays fully visible on the right the entire time.
- On a 375px viewport, a small "Preview" pill sits above the bottom nav and jumps to the preview.
- Nothing about the form fields, save flow, or preview contents changes.

## 2. Make color fields readable in Chrome and make edits obviously stick

Root cause of the "grey values in Chrome / real values in Firefox" report: `ColorRoleRow` renders `<input type="text" value={form.<field>} placeholder={resolved}>`. When the user hasn't overridden the color, `form.<field>` is `""`, so Chrome shows only the light-grey **placeholder**. Firefox tends to render placeholders slightly darker, which is why it looks like a real value there. Users read the greyed placeholder as "no value" and assume nothing saved.

Additionally, the native color picker (`<input type="color">`) in Chrome only fires `change` on close of the picker, not on every drag — an edit made and then abandoned by clicking elsewhere can appear to "not stick" if the user closes the window before `change` fires.

Fixes inside `ColorRoleRow` (and mirror in `HeroOverlayCard`):

- Show the resolved hex in the text input as a real value when the field is blank, styled to indicate "inherited, not overridden":
  - Compute `displayValue = value || resolved`.
  - Render `<input value={displayValue}>` with a subtle "inherited" pill/tag to the right (`Inherited` in muted text) whenever `value === ""`. As soon as the user types or picks, the pill disappears and `Reset` reappears.
  - Keep the current `Reset` button behaviour (writes `""`).
- Fire updates while dragging the picker too: add `onInput` in addition to `onChange` on `<input type="color">` so intermediate values propagate to `form` state and the preview updates continuously (also helps the "didn't stick" perception — the value is committed as soon as it changes).
- Normalise the text input on blur: trim, uppercase, and only commit if it matches `HEX_RE`; otherwise revert to previous value and flash the input border red for 1s. Prevents partial hex strings (`#12`) being silently kept in form state and then rejected on save.
- Keep `maxLength={7}` and the `#` prefix requirement.

Acceptance:
- In Chrome, every colour field shows a real hex value (either the user override or the inherited resolved value) — no more grey-only placeholder rows.
- Dragging the native colour picker updates the preview live; closing the picker leaves the chosen colour committed.
- Typing `#aabbcc` and tabbing away commits it; typing `#12` and tabbing away reverts and flashes the field.

## 3. Verification

- `tsgo` typecheck passes.
- Manual: open `/admin/events/:id/branding`, expand each section, change one value per section, confirm the preview updates without scrolling and the value persists after Save + reload in both Chrome and Firefox.

## Out of scope

- No changes to `resolveEventTheme`, palette storage, RLS, or the Save server function.
- No redesign of the left-hand section list itself (still collapsible sections in the same order).
