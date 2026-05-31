# Post-Cutover Hardening Checklist

Phases A + B are live. The Worker serves the apex, `www`, `app`, and every
proxied `*.getstampd.com.au` tenant subdomain. This checklist captures the
follow-up hardening work — no DNS changes, no rollback record removal, no
new SQL.

---

## 1. `/debug/worker-health`

**Recommendation: keep temporarily, then restrict.**

- Where it lives: `src/server.ts:118` (route handler) and
  `src/server.ts:70` (link from the SSR error page).
- It returns `runtime`, `host`, `hasSupabaseUrl`, `hasSupabaseKey` — no
  secrets, no PII. Safe to leave public for now.
- Keep for ~1–2 weeks while tenant subdomains bed in; it is the fastest
  signal that the Worker (not Lovable / origin fallback) is serving a
  given host.
- **Then restrict** by one of:
  - Gate the handler behind a shared header (e.g. `x-gs-health: <secret>`)
    set via `wrangler secret`, or
  - Move it to `/admin/debug/worker-health` so it sits behind the
    `_authenticated` + `platform_admin` gate, or
  - Delete the route and the error-page link entirely once we trust the
    cutover.
- Do **not** remove the link from the SSR error page until the handler
  is gated, or 500 pages will dangle a broken link.

## 2. Host Diagnostic panel

**Recommendation: keep platform_admin-only, but tighten the `?diag=1`
bypass.**

- Source: `src/components/host-diagnostic.tsx`. Today it renders when
  `access.isPlatformAdmin` **OR** when the URL contains `?diag=1`.
- The `?diag=1` escape hatch is anonymous — anyone who knows the query
  param sees host classification, resolved agency/event ids, and
  resolution source on any tenant subdomain. That is mild
  information-disclosure but should not stay open indefinitely.
- Short term (this sprint): leave `?diag=1` in place — it is the
  documented Phase B verification path.
- Within 2 weeks: drop the `?diag=1` branch and rely on
  `platform_admin` only. Support can sign in to view the panel.

## 3. Cloudflare Workers Logs / Observability

**Recommendation: keep enabled at full sampling for ~2 weeks, then dial down.**

- Currently `head_sampling_rate = 1` in both `wrangler.toml` and the
  patched `dist/server/wrangler.json`, with `invocation_logs = true`.
- That is the right setting while tenant routing is new — we need every
  request to be inspectable from the Dashboard.
- After 2 clean weeks (no Worker 5xx, no SSR error-boundary hits from
  prod hosts), reduce `head_sampling_rate` to `0.1` (10%) to control
  cost. Keep `enabled = true` and `invocation_logs = true` — they are
  cheap and invaluable for incident response.
- Traces remain off (correct — we are not paying for tracing yet).

## 4. Test / staging banners on production hosts

**Status: clean — no banner code in the bundle.**

- `src/components/test-env-banner.tsx` exists but `grep -r` finds **zero
  importers** anywhere in `src/`. It is dead code and never renders on
  any host (production or otherwise).
- Action: either delete the file or wire it to a real
  `import.meta.env.VITE_IS_STAGING` flag once the staging Supabase
  project (item 6) exists. Until then, leaving it unused is harmless.
- No other "staging" / "preview" / "test" banner components exist.

## 5. Supabase project consistency across hosts

**Status: ✅ all production hosts use the same live Supabase project.**

- `src/integrations/supabase/client.ts` reads `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY` from `import.meta.env` at **build
  time**. There is exactly one production Cloudflare build, so
  `getstampd.com.au`, `app.getstampd.com.au`, and every
  `*.getstampd.com.au` tenant subdomain are served from the same Worker
  bundle pointing at the same Supabase URL.
- Verify on demand via `/debug/worker-health` — `hasSupabaseUrl` /
  `hasSupabaseKey` should both be `true` on every host. If a tenant
  host ever reports `false`, the wildcard route is being intercepted
  before it reaches the Worker.
- No per-host Supabase override exists in the codebase — good. Do not
  introduce one.

## 6. Lovable preview/dev vs. live Supabase

**Status: ⚠ preview/dev is currently connected to the live (production)
Supabase project.** This is the highest-priority follow-up.

- Both the Lovable preview build and the Cloudflare production build
  read the same `VITE_SUPABASE_*` env vars, and only one Supabase
  project is wired in today.
- Risk: any write performed while testing in Lovable preview lands in
  the live DB. RLS protects against the worst cases, but
  platform_admin sessions in preview can mutate production data.
- Plan (no SQL applied yet — listed here as the next workstream):
  1. Create a new Supabase project `getstampd-staging`.
  2. Re-run the entire `supabase/migrations-draft-*` bundle there in
     order (tenant-routing, billing, announcements, etc.) — the same
     scripts that built production. No new SQL is authored; we simply
     replay drafts in the new project.
  3. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` on the
     Lovable preview environment to point at the staging project.
  4. Production Cloudflare build keeps the existing (live) values.
  5. Seed staging with synthetic agencies/events. Do **not** copy real
     visitor PII across.
  6. Once staging is wired, enable `src/components/test-env-banner.tsx`
     on it (item 4) so contributors visually know they are not in
     production.

## 7. Hard-coded domain cleanup

**Status: ✅ COMPLETE (Phase C1).** All 19 product/UI references to the
legacy `getstampd.com.au` typo have been rewritten to `getstampd.com.au`.
The only remaining occurrence in `src/` is the deliberate
backward-compatibility fallback in `src/lib/tenant-resolution.ts:45`,
which keeps historical `event_domains` rows resolvable.

`src/lib/domains.ts` now exports `PUBLIC_TENANT_ROOT_DOMAIN`,
`tenantHost(sub)`, and `tenantUrl(sub, path)` helpers. New code MUST
use these instead of hard-coding the domain string.
`SUBDOMAIN_ROOT` in `src/routes/admin.events.index.tsx` now derives from
`PUBLIC_TENANT_ROOT_DOMAIN`.

Verification:
- `grep -rn "getstampd" src/` returns only `src/lib/tenant-resolution.ts`
  (intentional fallback) and `src/lib/domains.ts` (explanatory comment).
- Legacy mentions remain in historical docs (`docs/deployment-getstampd.md`,
  `docs/plans/apple-mapkit-venue-picker.md`) and are not in scope.
- No DNS / Cloudflare / Supabase / behavioural routing changes.


## 8. Worker / project name (`region-beacon` → `getstampd-prod`?)

**Recommendation: keep `region-beacon` for now. Plan a rename in a
maintenance window, not as part of hardening.**

- The Worker is currently named `region-beacon` (set in `wrangler.toml`,
  echoed in `dist/server/wrangler.json` after the build patch, and
  bound to all Phase A + B routes in the Dashboard).
- Renaming a Worker in Cloudflare is **not in-place**: it creates a new
  Worker and orphans the old one. All Dashboard routes must be rebound,
  `wrangler secret`s re-set, observability re-enabled, and the
  `*.workers.dev` URL changes (`region-beacon.stockmansridge.workers.dev`
  → `getstampd-prod.stockmansridge.workers.dev`). Anything pinned to
  the old workers.dev URL (docs, monitors, webhooks, external services)
  must be updated.
- Cost of keeping the name: cosmetic only. Routes and DNS are
  hostname-based, not name-based — `region-beacon` serving
  `getstampd.com.au` is functionally identical to `getstampd-prod`
  serving it.
- When we do rename: do it in a low-traffic window, deploy the new
  Worker first, attach all routes to it, verify, then delete the old
  Worker. Update `wrangler.toml`, `docs/cloudflare/*.md`, and any
  `*.workers.dev` references in `/debug/worker-health` docs in the
  same commit.

---

## Constraints honoured

- No DNS changes.
- No rollback records removed (Lovable custom-domain bindings, Phase A
  records, and the wildcard CNAME all remain).
- No new SQL applied; staging project bootstrap (item 6) is **planned**,
  not executed.
- `workers_dev` stays `true`.
