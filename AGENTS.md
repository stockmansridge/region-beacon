# Project architecture rules

- Analytics daily registration and page-view charts share one date/count renderer so both retain readable date axes and integer count scales.
- Analytics postcode areas use the bundled ABS-derived, non-overlapping lookup with an unknown bucket, so split postcodes never double-count visitors.
- Analytics current prize qualification uses the complete agency-scoped points ledger and lifetime active-venue visits; legacy entries use the existing authorized draw-pool RPC, so bonus points and historical passports are not omitted.
- Analytics venue engagement uses the shared metrics helper for counts and venue-attributed bonus scans, so zero-activity venues and exports stay consistent.
- Analytics bonus item summaries aggregate the already event/date-filtered bonus ledger by event and source ID, so points remain distinct from scan counts and events never merge.
- Analytics event selection is a browser UI preference keyed by agency ID, restored after hydration and written only on explicit selection, so organisation changes cannot overwrite another organisation's choice.

- Interactive public maps measure the available visible viewport and the page's own bottom navigation; never impose a minimum canvas height that pushes selected venue details behind the menu.
- Public map location is requested only by an explicit visitor click, is never persisted, and is disabled in editor fixtures to avoid permission prompts or device-location side effects.

- Public passport item styling uses the versioned registry and allowlisted resolver in `src/lib/public-style-overrides.ts`; never add arbitrary CSS or selector persistence.
- V1 is the unchanged default renderer. V2 uses `event_branding.v2_style_config` only when that event's `public_template_version` is explicitly `v2`.
- Editor mode and the V2 document's schema version are not template selection. Opening or saving a V2 draft must never activate it.
- Branding ownership and every query/write are scoped by both `agency_id` and `event_id`; never use a slug as authoritative ownership.
- Public page previews must render the real public components; controlled preview state may supply safe fixtures but must not duplicate page markup.
- Repeated public records use stable database IDs for style identity; private visitor activity uses non-identifying template slots.
- Poster print-safe margins are applied by scaling and centering artwork during PDF export, not changing poster renderers, so original designs and aspect ratios remain intact.- Bulk poster PDFs embed JPEG pages with one shared font download and a per-poster timeout, because re-encoding many large PNGs in jsPDF freezes the browser.
- Saved visitor passports (`gs.passport.<event_id>`) are cleared only on a conclusive zero-row lookup and only if the stored token matches the rejected one, so outages or races never wipe valid access.
- Join-page "Log in" opens the passport from the email alone (owner-approved; no emailed link or code) by calling `lookup_passport_by_email` from the browser like sign-up, so it never depends on a server secret. It rotates the passport key, so earlier links on other devices stop working.
- Venue opening hours are fetched from Google only by the weekly pg_cron job (`/api/public/venue-hours/sync`, DB-stored token, single-flight lease, bounded batch) or an admin "Refresh" action, and stored in `venue_opening_hours`; public pages read stored hours only, so visitor traffic never incurs Google charges.
- Opening-hours transport selects direct Places API (New) only for the existing `VITE_DEPLOY_TARGET=cloudflare` build, reading `GOOGLE_PLACES_API_KEY` through request-time server bindings; other builds retain the connector gateway, so independently deployed Workers never depend on Lovable credentials or silently fall back.
