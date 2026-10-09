# Project architecture rules

- Interactive public maps measure the available visible viewport and the page's own bottom navigation; never impose a minimum canvas height that pushes selected venue details behind the menu.
- Public map location is requested only by an explicit visitor click, is never persisted, and is disabled in editor fixtures to avoid permission prompts or device-location side effects.

- Public passport item styling uses the versioned registry and allowlisted resolver in `src/lib/public-style-overrides.ts`; never add arbitrary CSS or selector persistence.
- V1 is the unchanged default renderer. V2 uses `event_branding.v2_style_config` only when that event's `public_template_version` is explicitly `v2`.
- Editor mode and the V2 document's schema version are not template selection. Opening or saving a V2 draft must never activate it.
- Branding ownership and every query/write are scoped by both `agency_id` and `event_id`; never use a slug as authoritative ownership.
- Public page previews must render the real public components; controlled preview state may supply safe fixtures but must not duplicate page markup.
- Repeated public records use stable database IDs for style identity; private visitor activity uses non-identifying template slots.
- Poster print-safe margins are applied by scaling and centering artwork during PDF export, not changing poster renderers, so original designs and aspect ratios remain intact.- Bulk poster PDFs embed JPEG pages with one shared font download and a per-poster timeout, because re-encoding many large PNGs in jsPDF freezes the browser.
