# Bigger, more dominant event logo + km distances

## What changes for customers

1. **Home page hero** — the event logo appears centred over the hero image, directly above the "Welcome" line and the event heading, at a genuinely dominant size (roughly 120px tall on mobile, larger on wider screens).
2. **Top bar** — the small logo in the public header is removed. The header falls back to the event name, as it already does for events with no logo.
3. **Branding editor** — the "Event logo" section gains two new options:
   - **Shape**: Square (rounded corners) or Circle.
   - **Backdrop**: Transparent, or a solid colour behind the logo so it stands out against a busy hero photo. When a colour is chosen, a colour picker sets it (defaults to white).
   These settings apply to the hero logo and the posters, and are visible in the live preview pane.
4. **Posters** — the event logo is at least twice its current size on the Event Trail poster and honours the new shape/backdrop settings.
5. **Venues page** — when sorted by Nearest, cards read `1.3km away` / `0.9km away` instead of metres.

## Distance formatting detail

Today `formatDistance` returns metres under 1km (`850 m`) and `1.3 km` above. It becomes km-only, always: `1.3km`, `0.9km`, `12km` for large values. The card text becomes `1.3km away`. "Distance unavailable" for venues with no coordinates is unchanged.

## Assumption to confirm

The Venue poster currently renders **no** event logo at all — only the Event Trail poster does. The plan enlarges the Event Trail poster logo and additionally **adds** the event logo to the Venue poster at the same enlarged size, so branding is consistent across both printables. Say the word at approval if the Venue poster should stay logo-free.

## Technical notes

**New branding fields** (additive, nullable, safe defaults):

- `events.logo_shape` — text, `'square'` | `'circle'`, default `'square'`
- `events.logo_backdrop` — text, `'transparent'` | `'color'`, default `'transparent'`
- `events.logo_backdrop_color` — text, nullable, hex (used only when backdrop is `'color'`)

Delivered as a production SQL migration under `supabase/migrations-prod-event-logo-style/apply.sql`, following the pattern used for `hero_body_color`.

**Reading the fields publicly.** `get_public_event_by_domain` has a wide return signature that previous work deliberately avoided changing. Same approach here: a small additive companion RPC `public.get_public_event_logo_style(_hostname text)` returning the three fields, called alongside the existing event fetch — so the live page, `?preview=1`, the draft preview route and the branding preview all resolve identically. The fields are added to `EVENT_BRANDING_SELECT` in `src/lib/event-branding-theme.ts` for admin-side reads.

**Files to change:**

- `src/components/event-public-landing.tsx` — render the hero logo block above the eyebrow inside the existing hero content stack; add a `data-brand-hint="logo"` hotspot so the branding preview's hover probe covers it.
- `src/components/public-event-nav.tsx` — remove the header `logoUrl` image branch (keep the name fallback). The drawer logo is left as-is; it is not the top bar and does not sit over the hero.
- `src/lib/event-logo-style.ts` (new) — one shared helper that turns `{ shape, backdrop, backdropColor }` into the wrapper style/class used by the hero, the posters, and the branding preview. One definition, no per-surface duplication.
- `src/routes/admin.events.$eventId_.branding.tsx` — shape and backdrop controls in the existing "Event logo" section; wire into the unsaved-form state so the pinned live preview updates immediately; save with the existing toast-based save path.
- `src/lib/poster-types.ts` — carry `logoShape`, `logoBackdrop`, `logoBackdropColor` on the poster branding object.
- `src/components/posters/event-trail-poster.tsx` — logo box from `160x72` to `320x144` (200% larger) plus shape/backdrop.
- `src/components/posters/venue-poster.tsx` — add the event logo at the enlarged size (see assumption above).
- `src/lib/venue-sort.ts` — `formatDistance` becomes km-only.
- `src/routes/live.$subdomain.venues.index.tsx` — card copy `${formatDistance(m)} away` now yields `1.3km away`; no other change needed.

**Fallbacks.** Events with no logo, or with the new columns absent in production before the migration runs, render exactly as they do today: no hero logo, header shows the event name, posters unchanged. The public read tolerates a missing companion RPC and falls back to square/transparent.

**Verification.** Typecheck, plus a Playwright pass over the hero at mobile and desktop widths for both shapes and both backdrop modes, and a check that hero/preview/draft-preview/branding-preview render the logo identically.
