# V2 public passport styling expansion

## P0 printed bonus QR repair
- [x] Restore event-wide and per-venue bonus token resolution with device-token support; corrected device migration and function-only repair at supabase/migrations-prod-bonus-device-token-repair/apply.sql; executable PostgreSQL regression tests pass, full suite 288/288 and automatic build OK.
- [ ] Apply and verify the repair in GetStampd-Prod, including rollback-only scenarios; blocked because this session has no production database connection or SQL write capability.

## Mobile QR scanning
- [x] Make bonus results inherit the event's saved branding while retaining unbranded defaults and existing points behavior; 95 focused preview checks pass, automatic build is clean, and real bonus presentation verified on mobile with safe sample branding. Live event read-back remains unverified; nothing deployed.
- [x] Accept bonus codes and other QR contents safely, retain venue scanning, and verify focused scanner regressions; 102 focused checks pass and automatic build is clean. Physical phone scanning and live bonus redemption remain unverified; nothing deployed.

## Analytics improvements
- [x] Rank Check-ins by venue by check-ins (bonus scans no longer reorder the list) with share kept on the check-in basis; focused metric checks pass.
- [x] Add a Bonus points item summary with scan/point totals while retaining the Bonus scans visitor matrix; focused mounted checks passed.
- [x] Show sideways venue-name headers in Check-in details and preserve sorting; 12 focused checks passed. Signed-in visual verification remains blocked by unavailable portal session.
- [x] Make marketing, pages and date lists scrollable; add rolling 1-day, 14-day and inclusive custom date ranges.
- [x] Add Australian state/region postcode percentages with documented ABS mapping coverage and unknown bucket.
- [x] Add zero-activity venue toggle and searchable/sortable venue engagement drilldown from the Venues total.
- [x] Complete points-based prize entrant details, retain authorized legacy draw pools, and verify 11 focused checks with safe sample records.
- [ ] Verify analytics interactions and entrant totals in an authenticated portal; blocked by unavailable managed session for this external connection. Nothing published or written to the database.

- [x] Separate unavailable passport-email lookup errors from not-found results; focused mocked lookup checks.
- [x] Correct the email-return SQL's pgcrypto schema references to match registration; SQL remains unapplied and live cause unverified.
- [ ] Verify the reported returning visitor's lookup in the correct event; blocked by unavailable database access and absent runtime error evidence.

- [x] Add date and count axes to the Page views analytics chart; real chart verified in browser with sample data (5–9 Oct and counts 0–32), not an authenticated analytics session.

- [x] Add a bottom-right current-location arrow to the public map; two focused checks pass, and browser-granted coordinates center the simulated map with the arrow clear of the menu/card at two screen sizes (live Apple location marker remains unverified).

- [x] Fit the public interactive map above its own menu; two focused sizing checks pass, and real page/pin-card layout verified at four screen sizes with safe sample data and a simulated map engine (live Apple tiles not verified).

- [x] Add Map View below the venue-list introduction and above passport/sorting on both public templates; two focused navigation checks pass and both layouts verified in browser with safe sample venues.

- [x] Add optional 5 mm print-safe white edge to bulk poster PDF downloads; focused PDF placement checks pass. Signed-in download flow remains unverified without an admin session.

- [x] Complete and document the public passport style and state audit.
- [x] Define the typed, versioned element/property registry and safe resolver.
- [x] Prepare review-only additive per-event V2 template/config and atomic activation migrations; none applied.
- [x] Separate V1 rendering from the event-owned V2 draft and gate V2 activation explicitly.
- [ ] Complete authenticated save/read-back and rollback verification after draft SQL is reviewed and applied in an isolated environment.
- [x] Upgrade V2 with page/state selection, exact instance selection, real responsive previews, and item/type/event scopes.
- [x] Wire the resolver and stable element identities through the currently supported public routes and shared result components.
- [ ] Move the six-field mapping correction behind V2 across every route; do not restyle V1 events.
- [ ] Verify legacy baselines, editing isolation, responsive layouts, permissions, failed saves, and persistence in an authenticated browser.
- [x] Add safe preview adapters for ordinary pages and Scan/Check-in/Bonus/Tasting result states.
- [x] Group current-page semantic inspector targets and wire shared navigation slots across V2 pages.
- [x] Complete canonical V2 public resolution for supported routes while preserving the explicit V1 boundary.
- [x] Namespace same-named V2 custom fonts by event and verify resolver isolation.
- [x] Add focused real-component fixture parity tests and reconcile the public styling audit with actual evidence.
- [x] Shared V2 back-link style, per-context overrides and event-scoped plain-text labels (destinations fixed).
- [x] Legal heading/chevron/surface/document text/headings/external button targets with terms/privacy slots.
- [x] Bookmarks leaf/thumbnail/arrow targets; V1 venue CTA restored; current-page bottom-menu colours; buffered menu names; passport progress/stamp card/text targets.
- [x] Final review: offers V1 fallback, badge legacy migration, nav selection via preview context, template-aware record copy, venue QR svg, back-link label buffering, legal reveal on repeat.
- [x] Header title target/text/wrap; remove join spacers; passport bold words inherit
- [x] Add V2 styling and safe labels for the shared Venues / Offers segmented toggle.
- [x] Reconciled Google Maps server credential: venue-hours server code prefers GOOGLE_MAPS_API_KEY_1 (owner dedicated server key), falls back to managed GOOGLE_MAPS_API_KEY. No paid Google calls made.
- [x] Add Cloudflare-only direct Places transport and presence-only health flag; 47 focused mocked/helper tests pass and automatic build is clean. No deployment or live refresh.
- [ ] Verify production Places secret resolution and the one-venue manual refresh; blocked by separate configuration/deployment/pilot approval. Current deployed health does not report the new presence flag.
- [x] Multi-device passport persistence: device-token table + central resolver migration (review-only, not applied), email login mints device tokens instead of rotating, client reuses valid saved token, returnTo resume after email login, re-register copy fixed.
- [ ] Apply supabase/migrations-passport-device-tokens/apply.sql and publish — awaiting owner verification/approval.

## Multi-device passport acceptance fixes
- [x] Check-in mismatch/no-passport errors now re-validate via get_passport_by_token and clear only on conclusive invalid/other-event with exact-token compare; conclusive invalid directs to email-only recovery with the scan preserved.
- [x] Email login fast path reuses the saved token only when the validated passport's email matches the entered email; a different email mints its own device alias.
- [x] consumeReturnTo is exactly-once (scoped consume clears matching pending) and never replays another event's pending scan; join page now shares the helper.
- [x] passport.index "Re-register" button replaced with "Log in with your email" → /join.
- [ ] Publish so the fixes reach production (migration already applied by owner); awaiting approval.
