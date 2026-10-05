# Public passport style audit

## Purpose and status

This audit is the coverage contract for the V2 visual editor. The typed source of truth is `PUBLIC_STYLE_ELEMENTS` in `src/lib/public-style-overrides.ts`. **Registered** means a stable allowlisted ID exists; **Wired** means the real public drawing node consumes it; **Previewed** means the editor renders that same component with safe injected data. No SQL, deployment, activation, or customer-data mutation was performed during this implementation.

## Multi-tenant template architecture

- Public templates are central platform code; customers never receive forked page implementations or shared default changes.
- V1 is the unchanged default. Missing, `NULL`, or unknown template selections resolve to V1 without item CSS.
- `event_branding.public_template_version` selects V1/V2 for one `(agency_id, event_id)`. It is distinct from editor mode and the config schema version.
- `event_branding.v2_style_config` stores sparse V2 theme and item/record overrides. Existing V1 columns remain available for rollback.
- Opening V2 and saving its draft do not activate it. “Use V2 for this event” atomically saves config and selects V2 through an RLS-governed RPC.
- Public reads first resolve one publishable event, join branding on agency and event IDs, and expose V2 config only when selected.
- V2 preview is forced locally and performs no activation write. Editor selection, cache and draft identity use the route event ID.

## Identity and inheritance

- Default scope is **This item**. Type/event scope is always an explicit action.
- Repeated venue and award items use `venue_id` and `award_id`. Sorting, filtering, and copy changes cannot move an override.
- Activity and leaderboard visitors use template slots, never passport IDs, access tokens, names, or array positions.
- Resolution is record override → item default → existing semantic theme/Brand Kit → legacy fallback.
- Stored documents are sparse. “Use default” removes one property; “Reset this item” removes the selected item object.

## Coverage matrix

| Page / state | Stable IDs (representative) | Owning real component | Current source before overrides | Controls | Status |
|---|---|---|---|---|---|
| Shared navigation: normal/active/open drawer | `shared.navigation.surface`, `.item`, `.activeItem`, `.drawer` | `PublicEventNav` | nav theme vars, colour-mix, opacity | surface, border, label/icon typography and interactive states | Wired in the shared component; previewed across all ordinary page fixtures |
| Announcements, activity, footer | `shared.announcement.*`, `shared.activity.surface`, `shared.footer.text` | `PublicAnnouncementBar`, `LiveActivityBar`, `PoweredByGetStampd` | nav/card vars and opacity | surface/text/icon | Registered; wiring pending |
| Home hero, empty logo/cover/welcome | `home.hero.surface`, `.cover`, `.logo`, `.welcomeLabel`, `.heading`, `.welcomeCopy` | `EventPublicLanding` | hero vars, image gradient, heading/body fonts | surface/overlay, text typography, backdrop | Registered; key items wired |
| Home summary: no passport/active/complete | `home.summary.surface`, `.ring`, `.progress` | `EventPublicLanding` | card, button and accent vars | card, track/fill, labels/numbers | Registered; key progress parts wired |
| Home actions: start/view/disabled/share | `home.primaryCta`, `.shareButton`, `.prizesButton`, `.venuesButton` | `EventPublicLanding` | shared button vars; Share previously transparent with primary colour | independent bg/text/border/icon and typography; state variants | Registered; key actions wired |
| Home nested cards: loading/empty/ready | `home.nextPrize.*`, `home.bonusPromo.*`, `home.collect.*` | `NextRewardCard`, `BonusPointsPromo`, `CollectPointsSection` | mixed hero accent, primary, raw props, gradients | surface, text, icon bg/icon, progress track/fill, CTA | Registered; key collision parts wired |
| Home/passport stamp grid: unstamped/stamped/bonus | `home.stamps.*`, `passport.stamp.*` + `venue_id` | `PassportStampGrid` | card, accent, page vars, state opacity | tile, label, badge/icon by venue or type | Registered; record wiring started |
| Passport dashboard: loading/invalid/active | `passport.page.surface`, `passport.progress.*`, `passport.stamp.*` | `passport.$token`, `PassportProgressCard`, `PassportStampGrid` | semantic vars plus SVG constants | page/card, progress numbers/ring, stamps, actions | Real safe fixture preview; item wiring pending |
| Join: loading/closed/form/error/success/resume | `join.page.surface`, `join.form.*`, `join.state.message` | `live.$subdomain.join` | canonical version-aware theme scope | every label/field/error/button and typography | Real safe form preview; writes, token checks and storage effects disabled; item wiring pending |
| Venues: loading/empty/search/sort/filter/list | `venues.page.heading`, `venues.controls.sort`, `venues.card.*` + `venue_id` | `live.$subdomain.venues.index`, `VenueSortControl` | canonical version-aware theme scope plus offer colours | controls, card surfaces/text/badges per type/venue | Real page previewed; heading/card surface/heading/body wired by stable `venue_id`; sort pending |
| Venue detail: actions/bookmark/content | `venue.actions.*`, `venue.bookmark` + `venue_id` | `live.$subdomain.venues.$venueId`, `BookmarkButton` | canonical version-aware theme scope | independent action/button/icon states | Real page previewed; heading/directions/website wired by stable `venue_id`; remaining nodes pending |
| Offers: empty/list/bookmarked | `offers.card.*` + `venue_id` | `live.$subdomain.offers` | canonical version-aware theme scope plus offer record colours | surface, text, icon/badge, bookmark | Real page previewed; card surface wired by stable `venue_id`; badge/bookmark pending |
| Prizes/rewards: tabs, locked/eligible/claimed/empty | `prizes.tabs.item`, `prizes.card.*` + `award_id` | `live.$subdomain.prizes`, awards components | semantic vars, raw badge/status mixes | tabs, card, badge, progress, CTA states | Real safe fixture preview; item wiring pending |
| Map: permission/error/list/selected marker | `map.controls.item`, `map.marker`, `map.list.card` + `venue_id` | `live.$subdomain.map`, app-owned map components | semantic vars and app marker colours | app controls/markers/cards | Real safe fixture preview; item wiring pending |
| Leaderboard: loading/empty/list/current row | `leaderboard.heading`, `.row`, `.rank` | `live.$subdomain.leaderboard` | semantic vars and rank decoration | heading/row/rank template slots | Real safe fixture preview; item wiring pending |
| FAQ: empty/collapsed/expanded | `faq.item.surface`, `.question`, `.answer` | `live.$subdomain.faq` | semantic vars in public route; admin component has admin-only raw colours | surface/question/answer/expanded state | Real safe fixture preview; item wiring pending |
| Terms/privacy | `legal.heading`, `legal.body` | public legal routes/components | semantic page/card vars | heading/body/link typography | Real safe fixture preview; item wiring pending |
| Scan and scanner states | `scan.control` | `scan`, `QrScanner` | semantic vars plus browser camera UI | app-owned controls/status only | Real safe fixture preview; item wiring pending |
| Check-in result: success/repeat/error/no passport | `checkin.result.*` | `checkin.$qrToken` | semantic vars | result surface/text/actions | Real safe fixture preview; item wiring pending |
| Bonus result: claimed/repeat/inactive/error | `bonus.result.*` | `collect.bonus.$token` | hard-coded green/gold gradient and constants | gradient, icon, text, totals, actions | Registered; hard-coded replacement pending |
| Tasting result: claimed/repeat/unavailable/error | `tasting.result.*` | `tasting.$qrToken` | hard-coded green/gold gradient and constants | gradient, icon, text, totals, actions | Registered; hard-coded replacement pending |
| Legacy `/t/:agency/e/:event` landing | home IDs after migration | `TrailLanding` via legacy tenant route | reduced palette mapping | same home registry where equivalent | Audited; not selectable; migration pending |
| Clean tenant-host routes | same IDs as `/live/$subdomain` | thin top-level route wrappers | delegated real components | identical to canonical route | Home and route-family delegates share their real components; browser route matrix pending |

## Known propagation corrections

1. `brandingScopeProps` reads but did not forward the six split page/card heading, body and muted fields. The canonical mapper must forward them separately.
2. `brandingToScopeProps` collapsed headings into legacy shared fields and omitted body/muted props. It must preserve both legacy aliases and all six explicit values.
3. Join, venues, offers and venue-detail route-local mappings have drifted subsets; they must move to the canonical shape as their page family is wired.
4. `collect.bonus.$token` and `tasting.$qrToken` use hard-coded green/gold result themes and only pass palette/background keys.
5. Dedicated heading fonts and uploaded font-face loading must travel with every public route family.

## Deliberately unsupported surfaces

- Pixels inside uploaded cover, logo, venue and prize images.
- QR payload/module geometry and encoded customer data.
- Browser/OS share sheets, camera permission prompts, location permission prompts, autofill UI and native form pickers.
- Third-party basemap labels, roads, imagery, copyright marks and provider controls. App-owned markers, lists, filters and wrappers remain supported.
- Marketing, admin and demo pages are outside event passport branding.

## Verification ledger

| Check | Status |
|---|---|
| Registry rejects unknown IDs/properties, invalid colours, unsafe gradients and out-of-range numeric values | Implemented in resolver; automated coverage pending |
| V1 isolation and unknown-version fallback | Implemented for central home renderer; full-route visual baseline pending |
| Event-scoped V2 save and explicit atomic activation | Prepared in review-only SQL/UI; authenticated runtime pending |
| Event A/B/C/D isolation and V1 rollback | Source scoping implemented for home; runtime and full-route matrix pending |
| Welcome / next-prize icon / next-prize fill / passport ring independent | Wiring in progress |
| Share background/text/border/icon independent | Wiring in progress |
| Editor preview has no artificial inert-link opacity | Wiring in progress |
| Save/read-back/new browser session | Unverified in this pass; current environment schema state is not assumed |
| Full page/state selector and real responsive viewport | Real iframe viewport renders Home, Join, Passport, Venues, Venue detail, Offers, Prizes, Map, Leaderboard, FAQ, Terms, Privacy, combined Legal and Bookmarks |
| Production SQL / customer actions | Not run by design |
## Control audit — repair pass (2026-10-05)

Evidence legend: **UNIT** = focused resolver regression; **SRC** = source review + compiler harness; **UNVERIFIED** = authenticated save/read-back or browser fixture assertion not executed.

| Control / finding | Target & property | Fallback | Result | Status |
|---|---|---|---|---|
| 1 Responsive preview | Real `PublicEventTemplate` portalled into a same-origin iframe (390 / 1280 px) with mirrored app stylesheets + fonts | — | Media queries, `fixed`, `100dvh` resolve to the frame; nav forced-`block` hack removed so desktop shows desktop nav, mobile shows real bottom menu | SRC; visual check BLOCKED |
| 2 Overlay opacity | `home.hero.cover` on the tint `div` only, slider 0–100 % → 0–1 | shared `hero_overlay_opacity` | Layer opacity multiplies the shared overlay strength (documented in UI); overlay-only settings no longer skipped by `EventPaletteScope` | UNIT (0/25/50/75/100 serialise); computed-style visual BLOCKED |
| 3 Colour fields | One `ColourControl` for every colour property (items, states, shared theme) | effective rendered colour read from the frame (`getComputedStyle`), checkerboard for transparent | Labelled quick choices from this event's draft theme, Brand Kit, recent; no fallback black; "Use default" deletes only that property | SRC; BLOCKED for runtime |
| 4 Welcome copy | Shared welcome panel shown under the `home.hero.welcomeCopy` item | welcome_copy → event description | Shows effective text and its source; nothing written on open; "Use inherited message" restores V1 value; clearing shows description | SRC |
| 5 Parser data loss | `cleanTheme` explicit per-key kind map | — | All 36 theme keys round-trip; invalid values reported and V2 save/activation refused | UNIT |
| 6 Icon/text coupling | `iconColor` → svg + `--item-icon-color` only; `iconBackgroundColor` paints only `kind: icon` | — | Text/bg/border/icon independent; state svg rules out-rank normal | UNIT |
| 7 Input buffers | HEX, gradient, font size, line height keep local drafts; commit only valid values | — | Typing "1" of "12" no longer discarded; inline errors | UNIT (validator); typing BLOCKED |
| 7 Fonts | Item font list includes uploaded event fonts; item-only fonts loaded by `PublicStyleScope` (preview + public) | inherited family shown | | SRC |
| 8 Identity | Hero surface, cover tint, logo, heading, welcome copy, page now carry stable V2 item IDs; selection reads `data-brand-instance` (`id@record`) | — | Repeated items: "This one only" (record) vs "Every venue (type default)"; merged resolution type → record per property | UNIT (merge); SRC |
| 8 Appearance | Hover/focus/active/disabled forced on the selected instance via `data-preview-state` (editor-only attribute) | — | | SRC |
| 8 Page selector | Page selector renders all ordinary public components with controlled event, record and visitor fixtures; Navigate mode switches among these pages without saving | — | Draft survives page/viewport/source switches; real route side effects remain suppressed by injected data and click interception | SRC; browser interaction pending |
| 9 Isolation | CSS prefixed with a unique `[data-public-style-root]` per scope | — | | UNIT |
| 9 Draft separation | Separate V1 form and V2 form; V2 values never enter the classic form; V2 config = V2 draft diffed against V1 | — | | SRC |
| 10 Save/activation | Busy state covers save + activation; activation validates, updates baseline from read-back; message distinguishes inactive draft vs already-live V2; Ctrl/Cmd+Z / Shift+Z / Y, Escape | — | | SRC; authenticated save/activation UNVERIFIED |

### Remaining after multi-page implementation pass
- Browser runtime checks (mobile nav scroll anchoring, overlay computed alpha, Share independence, typography loading, two scopes mounted together, V1 baseline) remain unverified in this sandbox.
- Home, Join, Passport, Venues, Venue detail, Offers, Prizes, Map, Leaderboard, FAQ, Terms, Privacy, combined Legal and Bookmarks use real-component previews with controlled fixtures. Scan, Check-in, Bonus and Tasting remain the authorised follow-up.
- Existing hook-based Passport, Check-in, Bookmarks, Prizes, Map, Leaderboard, FAQ and legal pages carry V2 `templateVersion` and `styleOverrides`; Join now uses the canonical version-aware scope. Scan, Bonus and Tasting still need canonical scope and presentational extraction.
- Real persistence/read-back, new-session reload, Event A/B/C/D isolation, and authenticated save remain unverified here; SQL state is not assumed.

## Multi-page implementation evidence (2026-10-05)

- Public V2 resolution: Home uses `PublicEventBrandingScope`; Venues, Venue detail and Offers merge the narrow public V2 payload then call the same `publicEventScopeProps`; Join now does the same instead of its reduced local mapper. Existing hook-driven routes pass the complete V2 scope bag.
- Shared navigation: `PublicEventNav` owns `shared.navigation.surface/item/activeItem/drawer` targets, one venue-label resolver, and one mobile/desktop implementation. The four previewed pages mount this component; active destination remains route-derived publicly.
- Real preview data: venue list/detail/offers accept explicit preview data and skip their public fetch effects. Stable record selection uses `venue_id`; the removed random list key can no longer relocate an override.
- Preview controls: Page, V2 draft/Saved V2 config, Select/Edit/Navigate and Mobile/Desktop are independent controls. Switching them does not call save or activation.
- Automated evidence: `src/lib/public-style-overrides.test.ts` passed 17/17, covering parser round-trip, invalid values, independent text/icon/background, scoped CSS, stable record merge, opacity conversion and unknown-version V1 fallback. Compiler harness build passed after these changes.
- Not yet evidence: full renderer DOM/browser parity is still unverified; resolver tests are not represented as visual parity proof.

## Save-path resilience (2026-10-05, follow-up)

**Reported failure:** `V2 branding could not be saved. Could not find the function public.save_event_v2_branding(...) in the schema cache` — the review-only migration drafts (01/02/03) had never been applied to the environment's database, so the RPC did not exist.

**Fix (SRC, build OK, tsgo clean, 17/17 unit tests):** `saveV2Branding(config, activate)` in `src/routes/admin.events.$eventId_.branding.tsx` now:
1. Tries the atomic `save_event_v2_branding` RPC first (preferred path once migration 03 is applied).
2. On a schema-cache miss (PGRST202 / "could not find the function"), falls back to a direct RLS-governed `event_branding` update of `v2_style_config` (and `public_template_version` only when activating), with a confirmed select read-back before reporting success.
3. If the V2 columns themselves are missing (migration 01 not applied), reports clearly that the V2 database changes have not been applied, keeps the draft open, and writes nothing — no fake success.

Both Save and "Use V2 for this event" share this helper, so activation can never report live without a confirmed config write.

**Still required outside the codebase:** apply `supabase/migrations-draft-event-style-overrides/01–03` to the target environment. Until at least migration 01 is applied, V2 persistence is BLOCKED there; the editor now says so explicitly instead of failing with a raw schema-cache error.
