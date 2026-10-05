# Public passport style audit

## Purpose and status

This audit is the coverage contract for the V2 visual editor. The typed source of truth is `PUBLIC_STYLE_ELEMENTS` in `src/lib/public-style-overrides.ts`. A row marked **Registered** has a stable allowlisted ID; **Wired** means the real public component consumes the resolver; **Previewed** means the V2 page/state picker can render and select it. Production SQL has not been applied.

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
| Shared navigation: normal/active/open drawer | `shared.navigation.surface`, `.item`, `.activeItem`, `.drawer` | `PublicEventNav` | nav theme vars, colour-mix, opacity | surface, border, label/icon typography and interactive states | Registered; landing markers partially wired |
| Announcements, activity, footer | `shared.announcement.*`, `shared.activity.surface`, `shared.footer.text` | `PublicAnnouncementBar`, `LiveActivityBar`, `PoweredByGetStampd` | nav/card vars and opacity | surface/text/icon | Registered; wiring pending |
| Home hero, empty logo/cover/welcome | `home.hero.surface`, `.cover`, `.logo`, `.welcomeLabel`, `.heading`, `.welcomeCopy` | `EventPublicLanding` | hero vars, image gradient, heading/body fonts | surface/overlay, text typography, backdrop | Registered; key items wired |
| Home summary: no passport/active/complete | `home.summary.surface`, `.ring`, `.progress` | `EventPublicLanding` | card, button and accent vars | card, track/fill, labels/numbers | Registered; key progress parts wired |
| Home actions: start/view/disabled/share | `home.primaryCta`, `.shareButton`, `.prizesButton`, `.venuesButton` | `EventPublicLanding` | shared button vars; Share previously transparent with primary colour | independent bg/text/border/icon and typography; state variants | Registered; key actions wired |
| Home nested cards: loading/empty/ready | `home.nextPrize.*`, `home.bonusPromo.*`, `home.collect.*` | `NextRewardCard`, `BonusPointsPromo`, `CollectPointsSection` | mixed hero accent, primary, raw props, gradients | surface, text, icon bg/icon, progress track/fill, CTA | Registered; key collision parts wired |
| Home/passport stamp grid: unstamped/stamped/bonus | `home.stamps.*`, `passport.stamp.*` + `venue_id` | `PassportStampGrid` | card, accent, page vars, state opacity | tile, label, badge/icon by venue or type | Registered; record wiring started |
| Passport dashboard: loading/invalid/active | `passport.page.surface`, `passport.progress.*`, `passport.stamp.*` | `passport.$token`, `PassportProgressCard`, `PassportStampGrid` | semantic vars plus SVG constants | page/card, progress numbers/ring, stamps, actions | Registered; preview pending |
| Join: loading/closed/form/error/success/resume | `join.page.surface`, `join.form.*`, `join.state.message` | `live.$subdomain.join` | manually forwarded semantic subset | every label/field/error/button and typography | Registered; wiring/preview pending |
| Venues: loading/empty/search/sort/filter/list | `venues.page.heading`, `venues.controls.sort`, `venues.card.*` + `venue_id` | `live.$subdomain.venues.index`, `VenueSortControl` | manually forwarded theme plus offer colours | controls, card surfaces/text/badges per type/venue | Registered; wiring/preview pending |
| Venue detail: actions/bookmark/content | `venue.actions.*`, `venue.bookmark` + `venue_id` | `live.$subdomain.venues.$venueId`, `BookmarkButton` | reduced theme subset and raw saved bookmark yellow | independent action/button/icon states | Registered; wiring/preview pending |
| Offers: empty/list/bookmarked | `offers.card.*` + `venue_id` | `live.$subdomain.offers` | semantic vars plus offer record colours | surface, text, icon/badge, bookmark | Registered; wiring/preview pending |
| Prizes/rewards: tabs, locked/eligible/claimed/empty | `prizes.tabs.item`, `prizes.card.*` + `award_id` | `live.$subdomain.prizes`, awards components | semantic vars, raw badge/status mixes | tabs, card, badge, progress, CTA states | Registered; wiring/preview pending |
| Map: permission/error/list/selected marker | `map.controls.item`, `map.marker`, `map.list.card` + `venue_id` | `live.$subdomain.map`, app-owned map components | semantic vars and app marker colours | app controls/markers/cards | Registered; wiring/preview pending |
| Leaderboard: loading/empty/list/current row | `leaderboard.heading`, `.row`, `.rank` | `live.$subdomain.leaderboard` | semantic vars and rank decoration | heading/row/rank template slots | Registered; wiring/preview pending |
| FAQ: empty/collapsed/expanded | `faq.item.surface`, `.question`, `.answer` | `live.$subdomain.faq` | semantic vars in public route; admin component has admin-only raw colours | surface/question/answer/expanded state | Registered; wiring/preview pending |
| Terms/privacy | `legal.heading`, `legal.body` | public legal routes/components | semantic page/card vars | heading/body/link typography | Registered; wiring/preview pending |
| Scan and scanner states | `scan.control` | `scan`, `QrScanner` | semantic vars plus browser camera UI | app-owned controls/status only | Registered; wiring/preview pending |
| Check-in result: success/repeat/error/no passport | `checkin.result.*` | `checkin.$qrToken` | semantic vars | result surface/text/actions | Registered; wiring/preview pending |
| Bonus result: claimed/repeat/inactive/error | `bonus.result.*` | `collect.bonus.$token` | hard-coded green/gold gradient and constants | gradient, icon, text, totals, actions | Registered; hard-coded replacement pending |
| Tasting result: claimed/repeat/unavailable/error | `tasting.result.*` | `tasting.$qrToken` | hard-coded green/gold gradient and constants | gradient, icon, text, totals, actions | Registered; hard-coded replacement pending |
| Legacy `/t/:agency/e/:event` landing | home IDs after migration | `TrailLanding` via legacy tenant route | reduced palette mapping | same home registry where equivalent | Audited; not selectable; migration pending |
| Clean tenant-host routes | same IDs as `/live/$subdomain` | thin top-level route wrappers | delegated real components | identical to canonical route | Home dispatcher wired; other route families pending |

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
| Save/read-back/new browser session | Blocked until review-only migration is authorised and applied |
| Full page/state selector and real responsive viewport | Pending |
| Production SQL / customer actions | Not run by design |