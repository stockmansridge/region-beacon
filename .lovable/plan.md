# Demo rebuild — Cargo Road Wine Quest parity

## Goal
Replace the current `/demo/*` routes with pages that look and behave like the
new public event pages under `/live/$subdomain/*`, using a hardcoded snapshot
of "Cargo Road Wine Quest" (`public_slug: evt-745pamk2vg`). No demo action
writes to the real event.

## Approach

The live pages are tightly coupled to DB RPCs and hooks like
`useCurrentEventPassport` / `usePassportHomeData`. Rather than duplicate ~2000
lines of markup, I will:

1. **Refactor the live pages into pure presentational components** that accept
   `event`, `venues`, `offers`, `awards`, `announcements`, `faq`,
   `bonusChallenges`, `passport`, `homeData` as props.
   - `LivePublicLoaded` → `PublicHomeView`
   - `PublicVenueListPage` → `PublicVenueListView`
   - `PublicVenueDetailPage` → `PublicVenueDetailView`
   - `PublicMapPage`, `PublicOffersPage`, `PublicAwardsPage`,
     `PublicFaqPage`, `PublicLeaderboardPage`, `PublicJoinPage` →
     matching `*View` components.
   - The existing `live.$subdomain.*` routes keep their loaders and pass real
     data into these views. No visible change for real events.

2. **Create `src/lib/demo-cargo-road.ts`** — a snapshot module with:
   - `DEMO_EVENT` — the event object (from `get_public_event` today), with a
     synthetic palette/brand-kit block so `EventPaletteScope` renders.
   - `DEMO_VENUES` — the 6 real venues (Rowlee, Cargo Road, Stockman's Ridge,
     Canobolas, Strawhouse, Dindima) with addresses + coords already fetched.
   - `DEMO_OFFERS`, `DEMO_AWARDS`, `DEMO_ANNOUNCEMENTS`, `DEMO_FAQ`,
     `DEMO_BONUS_CHALLENGES`, `DEMO_LEADERBOARD` — plausible sample content
     so every page has something to render.
   - `DEMO_PASSPORT` type + an in-memory zustand-lite store
     (`useDemoPassport()`) tracking visited venue IDs, points, first name.
     Stamps and points update in the browser only; a "Reset demo" action
     clears them.

3. **Rewrite each `/demo/*` route** as a thin wrapper that renders the
   matching `*View` with `DEMO_*` snapshot data and the fake passport, plus a
   persistent "Demo mode · nothing is saved to the real event" banner:

   ```text
   /demo                     → PublicHomeView
   /demo/join                → PublicJoinView (submit only updates local state)
   /demo/passport            → existing passport home view, driven by fake passport
   /demo/wineries            → PublicVenueListView
   /demo/wineries/$venueId   → PublicVenueDetailView (offers, bonus, check-in CTA)
   /demo/trail-map           → PublicMapView
   /demo/offers              → PublicOffersView
   /demo/rewards             → PublicAwardsView
   /demo/checkin/$venueId    → simulated stamp screen → updates fake passport
   /demo/invite              → simple share sheet (no real link)
   /demo/more                → menu (FAQ, leaderboard, terms preview links)
   ```

4. **Bottom nav / header links** inside the `*View` components already build
   URLs from a `basePath` (or subdomain). I'll thread a `linkBuilder` prop so
   live routes keep producing `/live/$subdomain/...` and demo routes produce
   `/demo/...`. No hardcoded `/live/` strings inside the view components.

5. **Guardrails against real writes**:
   - Demo routes never import server functions that mutate.
   - `/demo/join` and `/demo/checkin/$venueId` only touch the fake passport
     store; they never call `supabase.rpc` or server functions.
   - Cross-check: `rg "supabase\.rpc|createServerFn|useServerFn" src/routes/demo`
     must return zero mutating calls after the refactor.

## Technical notes

- Snapshot lives in a plain TS file — no Cloud calls at runtime, so the demo
  works even if the real event is unpublished or renamed.
- `EventPaletteScope` needs the palette CSS variables; snapshot will include
  the same `primary_color`/`accent_color` (`#1F3D2B` / `#B5572A`) already
  used by the real event, plus reasonable defaults for other tokens.
- Cover / logo images: snapshot uses the public storage URLs already served
  by `getEventAssetPublicUrl` (they're public assets, so referencing them from
  demo is fine and doesn't count as a "real event write"). If we'd rather
  fully self-contain, I can swap in placeholder images — call it out.
- Old `demo.*.tsx` files that no longer map to a live equivalent
  (`demo.invite`, `demo.more`) are kept with light updates so existing
  links don't 404.

## Out of scope

- Real QR scanning in demo (`/demo/checkin/$venueId` is a canned success
  screen).
- Real leaderboard writes / opt-out.
- Any change to `/live/$subdomain/*` visuals — refactor is behavior-preserving.

## Deliverables

- `src/lib/demo-cargo-road.ts` (snapshot + fake passport store)
- New `src/components/public/*View.tsx` files extracted from live routes
- Updated `src/routes/live.$subdomain.*.tsx` to render the extracted views
- Rewritten `src/routes/demo.*.tsx` set
- Typecheck clean
