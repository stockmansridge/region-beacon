# Build the V2 visual branding editor

## Goal
Add an optional “V2 Editor” beside the existing landing-page editor. V2 will let administrators select real preview elements and edit the existing shared branding settings without changing storage or public behaviour.

## Changes
- Add the exact “V2 Editor” entry button while preserving the current editor button and permissions.
- Add a validated editor mode to the existing branding route so both interfaces share one loaded form, dirty state, validation, uploads, and save workflow.
- Build a responsive three-panel V2 workspace: semantic navigator, real landing-page preview with mobile/desktop widths, and contextual inspector.
- Define one typed semantic-role map to existing branding fields, with explicit preview-only role markers for hero, text, surfaces, cards, controls, progress graphics, links, logo/cover, and navigation.
- Intercept pointer and keyboard activation only inside V2 preview; keep scrolling available, support Escape, show hover/selection overlays without layout shifts, and keep public pages unchanged.
- Reuse existing colour, Brand Kit, font, logo, cover, focal-point, welcome-copy, contrast, validation, and save controls. Explain shared setting scope and immediate image persistence.
- Guard immediate asset/font operations when form edits are pending so drafts cannot be lost, and guard leaving either editor with unsaved changes.
- Record the shared-editor architecture rule in project documentation.

## Technical details
- Keep `EventPublicLanding` as the only landing renderer and conditionally emit stable `data-brand-role` markers in preview mode.
- Keep existing database columns, theme resolution, tenant checks, and persistence payload unchanged.
- Use query-string mode switching within the same mounted route/state where possible; no migrations or new APIs.

## Validation
- Check old/V2 entry and in-place switching, exact selection roles, immediate preview updates, width switching, blocked preview actions, keyboard selection, reset/Brand Kit semantics, view-only state, and dirty guards.
- Run focused type checking and inspect the latest preview build diagnostics.
- Use an authenticated preview session if available; otherwise report authenticated persistence checks as unverified without changing customer data.
