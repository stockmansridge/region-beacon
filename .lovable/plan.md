# Expand V2 into the public passport style editor

## Goal
Extend the working V2 editor from shared landing-page colours into a versioned, event-scoped editor for individually selectable items across the public passport experience. Existing events must render identically until an organiser deliberately saves an item override.

## Delivery sequence

### 1. Audit and compatibility baseline
- Add `docs/branding/public-passport-style-audit.md` with every public page, section, visible part, conditional state, stable element ID, owning component, current style source, proposed controls, selection coverage, and verification status.
- Cover home, passport, join, venues/detail, offers, prizes/bonus, map, leaderboard, FAQ/legal, scan/check-in/bonus/tasting results, navigation/drawer, announcements/activity, dialogs/toasts, legacy tenant routes, and reusable cards.
- Record unsupported external surfaces honestly: uploaded image pixels, QR payloads, browser permission/share UI, and third-party basemap labels.
- Capture override-free desktop/mobile baselines before changing the shared resolver.

### 2. Typed override foundation and review-only SQL
- Add one typed, versioned registry for page templates, stable element IDs, supported properties, states, inheritance, and record/template scope.
- Support allowlisted colour, background, border, icon stroke/fill/background, opacity/gradient, font family, font size, weight, line height, and alignment properties. Unknown IDs/properties are ignored.
- Add a small shared resolver that emits only validated override variables/styles and is used identically by editor previews and public rendering.
- Prepare, but do not apply, an additive migration adding nullable `style_overrides jsonb` to `event_branding`, including document validation, rollback, grants/policies review, and updated public RPC return contracts.
- Extend canonical branding types/selects with the override document. Never silently drop this field when the migration is unavailable.

### 3. One draft and persistence lifecycle
- Add the override document to the existing Branding form, dirty tracking, save payload, confirmed returned row, error handling, and old-editor preservation.
- Validate version, IDs, properties, finite ranges, supported fonts, colours, gradients, and record IDs before saving.
- Add draft undo/redo, per-property “Use default”, “Reset this item”, and deliberate “Apply to similar items” actions.
- Keep shared Brand Theme/Kit edits separate from item overrides so selecting/editing an item does not mark the kit Custom.
- Keep immediate image/font persistence and the existing save/discard/cancel protection.

### 4. Upgrade the V2 workspace
- Add a Page selector plus page-specific section/element tree, including hidden and empty items.
- Add safe state selectors for menu-open, expanded, loading, empty, error, success, disabled, active, locked, eligible, and claimed views without invoking customer actions.
- Make “This item” the default scope. Add explicit type-default, stable-record, and event-wide apply scopes where supported.
- Select the exact DOM instance using stable element and instance markers; repeated records use database record IDs, while private activity/leaderboard rows use template slots.
- Add contextual Content/Style controls, full text typography, button parts/states, surfaces, icons, and progress track/fill controls.
- Render real page components in an isolated preview viewport so mobile media queries use the selected width. Keep links, submits, shares, scans, claims, and customer writes inert only inside V2.

### 5. Public component and route coverage
- First separate the reported collisions: Welcome label, next-prize icon background, next-prize progress fill, passport progress ring, and Share button background/text/border/icon.
- Remove the editor-only artificial link opacity while preserving genuine disabled opacity and standalone preview behaviour.
- Add stable markers and resolver hooks to the nested landing/passport cards and all shared public navigation/surface components.
- Wire overrides through every audited route and read path, including clean tenant routes and `/live/$subdomain` routes.
- Correct propagation of the six page/card heading/body/muted fields and dedicated heading fonts. Gate activation so override-free events retain their current appearance.
- Replace hard-coded result-page theme colours with inherited defaults plus independently editable item slots.

### 6. Verification and handoff
- Verify the requested colour-isolation examples, independent buttons and label typography, exact instance targeting, reset/undo/redo, deliberate scope application, and stable record overrides after sort/filter.
- Verify real mobile/desktop breakpoints, long text, open overlays, major conditional states, focus visibility, keyboard selection, and blocked preview actions.
- Check read-only permissions, event isolation, save failure, unsaved navigation, old-editor preservation, and no writes on open/select/close.
- Compare override-free legacy and modern fixtures against baselines.
- Run focused checks and project diagnostics. Test save/reload/new-session persistence only in an authorised environment after the prepared migration is applied; otherwise report persistence as blocked and leave the draft unsaved rather than claiming success.

## Technical details
- Existing shared theme fields remain the fallback layer; item overrides are sparse and never snapshots of computed styles.
- CSS/DOM output is generated only from the typed registry. No arbitrary selectors, raw CSS, layout/visibility/data mutation, or token-based private identities.
- Repeated public venue/reward records use `venue_id`/award IDs. Dynamic private visitor entries use non-identifying template slots.
- Posters remain on shared branding unless explicitly audited as a public passport surface; page-specific overrides do not affect them.
- Production SQL, deployment, publishing, and real customer actions are excluded.

## Assumptions
- The additive JSONB migration will be reviewed and applied separately before persistence can be verified.
- The existing real components remain authoritative; controlled preview adapters may inject read-only fixture state but will not duplicate their markup.
- Delivery will be incremental by page family, but the audit and registry will track all requested coverage and no partial landing-only result will be called complete.
