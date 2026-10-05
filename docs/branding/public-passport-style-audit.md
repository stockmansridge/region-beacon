# Public passport style audit

## Purpose and status

This audit is the coverage contract for the V2 visual editor. The typed source of truth is `PUBLIC_STYLE_ELEMENTS` in `src/lib/public-style-overrides.ts`. **Wired** means the real public drawing node consumes the allowlisted ID. The editor navigator is derived from the IDs actually rendered in the preview DOM (there is no separate static "wired" list). **Previewed** means the editor renders that same component with safe injected data. No SQL, deployment, activation, or customer-data mutation was performed during this implementation.

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

## Database dependency

`event_branding.public_template_version` and `event_branding.v2_style_config` exist in the project database (applied by the owner). Saving uses `save_event_v2_branding` with an RLS-governed fallback; no SQL was written or run in this pass.

## Coverage matrix

Status key: **Wired + tested** = item styles reach the real node and a focused automated test asserts it; **Wired** = source-verified only.

| Page / state | Stable IDs (representative) | Real component | V1 boundary | Status |
|---|---|---|---|---|
| Shared navigation (all pages) | `shared.navigation.*` | `PublicEventNav` | historic props per page profile | Wired; mounted test: preview makes no storage/RPC/share calls and every link stays in preview |
| Home hero/summary/actions/nested cards/stamps | `home.*` | `EventPublicLanding`, `CollectPointsSection`, `PassportStampGrid` | V1 renderer unchanged | Wired; mounted test: preview clicks every action with zero visitor storage, RPC, share/clipboard or router calls |
| Passport | `passport.*` | `PassportPreview` | — | Wired; previewed with sample state |
| Join form | `join.form.field` (input property set: bg/text/border/typography), labels, buttons | `live.$subdomain.join` | `join` V1 profile | Wired (source) |
| Venues list + sort | `venues.*` + `venue_id`; `venues.controls.sort` | `VenueSortControl` | `list` V1 profile | Wired + tested: sort typography inherited by the visible `<select>` (computed 18px in test) |
| Venue detail | `venue.*` + `venue_id` | `live.$subdomain.venues.$venueId` | `detail` V1 profile | Wired (source) |
| Offers | `offers.card.*` + `venue_id` | `live.$subdomain.offers` | `list` V1 profile | Wired + tested (record vs item override) |
| Prizes | `prizes.*` + `award_id` (badge carries award id) | `live.$subdomain.prizes` | — | Wired (source) |
| Map | `map.marker` + `venue_id`, `map.list.card`, `map.controls.item` | MapKit annotations + fallback list, via `resolveMapMarkerStyle` | V1: exact historic pin colours, no overrides | Wired + tested (resolver). Preview never loads MapKit, tokens or geolocation |
| Leaderboard, FAQ, Terms/Privacy, Bookmarks | `leaderboard.*`, `faq.*`, `legal.*` | real routes with preview data | — | Wired; legal tested |
| Scan | `scan.*` | `ScannerView` | V1 reads raw row (exact legacy prop bag); V2 reads the canonical event (saved theme + item overrides) | Wired + tested (V1 raw colours, V2 theme replaces them); mounted zero-side-effect test for every sample state |
| Check-in result | `checkin.result.*`, `checkin.failure.*` | `CheckinView` | full historic key bag | Wired + tested (V1 uses raw primary, ignores V2 theme) |
| Bonus / Tasting result | `bonus.*`, `tasting.*` incl. icon/kicker/status | `BonusView`, `TastingView`, `FailureCard` | palette/background keys only; exact `linear-gradient(160deg, #1F3D2B 0%, #14271C 100%)` | Wired + tested (V1 gradient exact in public and preview; V2 theme + heading-only override) |
| Legacy `/t/:agency/e/:event` | — | `TrailLanding` | legacy | Not editable (out of scope) |

Result previews inject the same resolved branding keys the public controller would load, so each view applies its own version-specific profile in preview (no outer override scope). All in-event links in result views use a preview-aware anchor.

## Genuinely unsupported controls

- `map.marker` exposes only pin colour (icon background) and glyph colour, plus a selected-state glyph colour: MapKit marker annotations cannot draw borders, fonts or opacity, so those are not offered. Visited pins keep the theme primary colour and check glyph so "visited" remains distinguishable.
- Pixels inside uploaded images, QR geometry, OS share/camera/location/autofill UI, third-party basemap content, and marketing/admin/demo pages.

## Verification ledger (this pass)

| Check | Kind | Result |
|---|---|---|
| Typecheck (`tsgo`) | source | Pass |
| Automated tests: 3 files, 73 tests | 27 SSR/pure + 46 mounted (happy-dom + React DOM, `src/routes/-v2-preview-mounted.test.tsx`) | Pass |
| Mounted side-effect tests: nav, Home, 17 result states × V1/V2 | spies on local/session storage, backend RPC/table, fetch, camera, geolocation, share, clipboard, notifications, router | Pass after fixing three leaks they found (nav venue-label lookup, Share button, Home collect/stamp sections) |
| App build | automatic preview build | OK |
| Real browser rendering (mobile/desktop) | browser | **Not run**: the editor needs a signed-in admin and no session is available in this environment. Mounted DOM tests are not browser verification |
| Authenticated save → reload, hostname and `/live` route parity, A/B/C/D isolation against real rows | runtime/persistence | **Unverified** (no session; no customer data used) |
