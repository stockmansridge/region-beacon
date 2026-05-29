# Draft plan: Apple Maps (MapKit JS) venue create/edit

Status: PLAN ONLY. No code, no tokens, no credentials, no MapKit script
loaded, no database changes. Awaiting approval before any implementation.

## 1. Goal

Replace the lat/lng-as-primary workflow on venue create/edit with a
map-driven flow powered by Apple MapKit JS + Apple Maps Server APIs.

User flow:
1. Admin clicks **Add venue** (or **Edit** on an existing venue).
2. A map panel opens with a search box.
3. User searches a place / address (Apple Maps Search).
4. Suggestions appear; selecting one drops a pin and pre-fills the form.
5. User can drag the pin or click the map to manually place it.
6. User confirms/adjusts name, address, phone, website before saving.
7. Editing an existing venue opens the map centred on its current pin; the
   user can move the pin or pick a new search result to replace coords.

The `public.venues` table is **not** renamed and its columns
(`name`, `address`, `latitude`, `longitude`, `website`, `phone`, …) are
unchanged.

## 2. Why Apple MapKit JS (not Google Maps)

- Per requirement: do not use Google Maps.
- Apple MapKit JS is free for moderate volumes (currently 250k map views
  + 25k search calls per day per Apple Developer team — verify quota at
  implementation time).
- Native-feel map matches the iOS-skewed event audience.
- No card on file required to start; daily quota only.

## 3. Apple Developer credentials required

These must be obtained by the GetStampd Apple Developer team before any
implementation:

| Item                  | Where                                  | Public?  |
|-----------------------|----------------------------------------|----------|
| Apple Developer Team ID | developer.apple.com → Membership     | semi-public (used as JWT `iss`) |
| MapKit JS Key ID      | Certificates, IDs & Profiles → Keys → "+" → enable MapKit JS | semi-public (used as JWT `kid`) |
| MapKit JS Private Key (`.p8`) | Downloaded once at key creation | **SECRET** |
| Allowed domains       | configured on the Key                  | n/a (server-side config) |
| Short-lived MapKit JWT | minted on demand by our backend       | public (sent to browser) |

Key handling rules:
- The `.p8` private key **must never** be committed, embedded in the
  frontend bundle, sent over the wire, or stored anywhere readable by
  agency users.
- The `.p8` lives only in Lovable Cloud secrets (Edge Function env), e.g.
  `MAPKIT_PRIVATE_KEY`, `MAPKIT_KEY_ID`, `MAPKIT_TEAM_ID`.
- Allowed domains on the MapKit key must list:
  - `*.lovable.app` (preview)
  - `getstampd.com.au`, `www.getstampd.com.au`
  - `*.getstamped.com.au` (visitor-facing subdomains — only relevant if we
    ever embed maps on the visitor side; for admin-only use, restrict to the
    admin host only)
- Restrict the key to **MapKit JS** and **Maps Server APIs** only.

## 4. Token architecture (recommended)

We mint a short-lived **MapKit JS JWT** server-side and hand it to the
browser. The browser uses it to authenticate MapKit JS and to call the
Apple Maps Server APIs (Search, Geocode, Reverse Geocode) directly when
possible. For server-trusted lookups (e.g. resolving address details on
save), a backend call mints a token internally.

Two Edge Function / server-function endpoints:

1. `getMapkitToken` (server function, `requireSupabaseAuth`, admin roles only)
   - Reads `MAPKIT_PRIVATE_KEY`, `MAPKIT_KEY_ID`, `MAPKIT_TEAM_ID` from env.
   - Signs an ES256 JWT with:
     - `iss` = Team ID
     - `kid` = Key ID
     - `iat` = now
     - `exp` = now + ~30 min
     - `origin` = the admin host (e.g. `https://www.getstampd.com.au`)
   - Returns `{ token, expiresAt }`.
   - Auth: only `platform_admin`, `agency_owner`, `agency_admin`, `agency_staff`
     (staff can be read-only on the form but still needs the map to display).

2. `searchPlace` *(optional, server-side proxy — phase 2)*
   - For richer place details (phone, website) we may call Apple's
     `/v1/place/{id}` server-side and return a normalised JSON to the
     client. This keeps response shape stable and lets us cap usage.

Whether to use direct browser calls vs proxy:
- **Phase 1**: browser calls MapKit JS Search using the minted token.
  Simpler. Apple's Search returns name, address, coords. Phone/website are
  not always present.
- **Phase 2**: backend proxy for `/v1/place/{id}` to fetch phone/website
  reliably and to centralise rate limiting + caching.

## 5. Frontend components needed

All client-only (MapKit JS touches `window`, must be wrapped in
`<ClientOnly>` and `useEffect`-loaded):

- `MapKitProvider` — loads `https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js`
  once, calls `mapkit.init({ authorizationCallback })` that fetches the
  token from `getMapkitToken`, handles refresh ~5 min before expiry.
- `VenuePicker`
  - Search input (Apple `mapkit.Search` instance)
  - Result list dropdown
  - `mapkit.Map` instance with a single draggable `mapkit.MarkerAnnotation`
  - Click-to-drop-pin handler (reverse-geocode via `mapkit.Geocoder`)
  - Drag end handler (reverse-geocode)
  - Emits `{ name, address, latitude, longitude, website?, phone? }`
- `VenueForm`
  - Wraps `VenuePicker` on top
  - Below the map: editable name, address, phone, website, lat, lng
    (lat/lng become read-mostly but still editable for power users)
  - Save button → existing venues mutation
- `VenueDialog` — modal shell used by Add and Edit
- `MapKitScriptGate` — `<ClientOnly fallback={…spinner…}>`

## 6. Implementation phases

**Phase 0 — credentials & approval (manual, blocking)**
- Apple Developer team creates a MapKit JS key, sets allowed domains.
- Downloads `.p8`, stores it as Lovable Cloud secret `MAPKIT_PRIVATE_KEY`
  + `MAPKIT_KEY_ID` + `MAPKIT_TEAM_ID`.
- Approve this plan.

**Phase 1 — token endpoint**
- Add `getMapkitToken` server function (`requireSupabaseAuth`, role check).
- Unit-friendly: returns 401 to non-admins.
- No UI yet.

**Phase 2 — `VenuePicker` MVP**
- Load MapKit JS via `MapKitProvider`.
- Search + select + drop pin + drag pin.
- Pre-fill name/address/lat/lng.
- Wire to existing `Add venue` button — gate behind a feature flag
  (`enableMapKitVenuePicker`) so it can ship alongside the old form.

**Phase 3 — Edit existing venue**
- Open dialog with map centred on existing coords; allow move/replace.

**Phase 4 — Phone/website enrichment**
- Add server-side `searchPlace` proxy that calls Apple Maps Server API
  `/v1/place/{id}` and returns normalised JSON.
- Auto-fill phone/website when present; user can override.

**Phase 5 — Cleanup**
- Remove the old lat/lng-first form once the new flow is validated.

## 7. Risks & limitations

- **Apple quotas**: 250k map views + 25k searches/day per team. Monitor;
  add backend caching for repeated geocodes.
- **JWT expiry**: tokens are short-lived; need refresh logic with a small
  safety margin to avoid mid-session 401s.
- **Allowed-domain mismatch**: if `origin` in the JWT or the key's allowed
  domains doesn't match the host serving the page, MapKit refuses to
  initialise. Must include preview hosts.
- **Place detail gaps**: not every Apple Place has phone/website. UI must
  treat those as optional.
- **SSR**: MapKit JS is browser-only. All map code must be `<ClientOnly>`,
  never imported at module scope of a route file.
- **Accessibility**: pin-drop + keyboard search must remain keyboard
  navigable; ensure manual lat/lng entry stays available as a fallback.
- **Offline / blocked**: corporate proxies sometimes block
  `cdn.apple-mapkit.com`. Fallback: manual address + lat/lng form.
- **Cost expansion**: if usage grows beyond Apple's free tier, evaluate
  paid Apple Maps Server API tier vs. switching providers.

## 8. What this plan does NOT do

- Does not load any MapKit script today.
- Does not request, store, or rotate any Apple credentials today.
- Does not modify the `venues` table or any RLS policy.
- Does not change the existing manual lat/lng form until Phase 5.

## 9. Confirmation

- No code written.
- No SQL written or executed.
- No secrets added.
- No production, schema, RLS, or storage changes.
