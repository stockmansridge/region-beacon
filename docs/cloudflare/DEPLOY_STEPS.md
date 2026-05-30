# Cloudflare Production Deployment — GetStampd (getstampd.com.au)

Status: **PREP ONLY**. Cloudflare DNS is authoritative for `getstampd.com.au`
(nameservers cut over at Crazy Domains). No Worker is deployed, no records
added beyond Cloudflare's import, no further SQL pending.

Lovable remains preview/dev. Cloudflare becomes production hosting + routing.

> **Environment model (post-promotion):** the Supabase project currently
> connected to this repo is the **production / live** database (1 agency,
> 4 events, tenant-routing SQL already applied). Lovable preview/dev is
> temporarily pointed at the same project. A separate staging/dev Supabase
> project will be created **after** Cloudflare production is stable. There
> is no separate "staging DB" to maintain right now.

---

## 1. Build

| Item               | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Install            | `bun install`                                                                               |
| Build              | `bun run build`                                                                             |
| Worker entry       | `.output/server/index.mjs`                                                                  |
| Static assets      | `.output/public/`                                                                           |
| Target             | Cloudflare Workers (workerd) via nitro `cloudflare-module` (preset from `@lovable.dev/vite-tanstack-config`) |
| Node compat        | Required — `compatibility_flags = ["nodejs_compat"]`                                        |

---

## 2. Supabase env vars (the **only** app-side prerequisite)

`src/integrations/supabase/client.ts` reads:

- `import.meta.env.VITE_SUPABASE_URL`
- `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`
- `import.meta.env.VITE_DEPLOY_TARGET` (build-time deploy-target tag)

All three are replaced by Vite at **build time** (not runtime). Behavior:

| Build context                          | `VITE_DEPLOY_TARGET` | Supabase env vars | Resolves to                              |
| -------------------------------------- | -------------------- | ----------------- | ---------------------------------------- |
| Lovable preview / dev                  | unset                | unset             | Hardcoded fallback (= current/live project) |
| Cloudflare test deploy (workers.dev)   | `cloudflare`         | **Required**      | Whatever you set (use the live project)  |
| Cloudflare production cutover          | `cloudflare`         | **Required**      | The live project (same values)           |

Guards:
1. **Build-time guard** — `VITE_DEPLOY_TARGET=cloudflare` without both Supabase
   env vars → throws at module init. Cloudflare deploys must be explicit; they
   never silently inherit the hardcoded fallback.
2. **Missing-config guard** — neither env vars nor fallback present → throws.

### Setting the build env

The current/live Supabase project values (use these for both the
workers.dev test deploy and the eventual production cutover):

- `VITE_SUPABASE_URL`            = `https://kyjwifumacnrpgyextzz.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the anon JWT hardcoded in
  `src/integrations/supabase/client.ts` (`CURRENT_PROJECT_PUBLISHABLE_KEY`)

```bash
# Inline (one-off) — REQUIRED form for any Cloudflare build
VITE_DEPLOY_TARGET=cloudflare \
VITE_SUPABASE_URL=https://kyjwifumacnrpgyextzz.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<live-anon-jwt> \
  bun run build
```

```bash
# Or a local .env.production.local (gitignored)
cat > .env.production.local <<'ENV'
VITE_DEPLOY_TARGET=cloudflare
VITE_SUPABASE_URL=https://kyjwifumacnrpgyextzz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<live-anon-jwt>
ENV
bun run build
```

Vite auto-loads `.env.production.local` for `mode=production` (the default for
`vite build`). Do not commit it.

Lovable preview/dev keeps working with no env wiring — `VITE_DEPLOY_TARGET`
is unset there, so the cloudflare guard doesn't fire and the hardcoded
fallback (= live project) is used.

### Runtime env (Worker `[vars]` / secrets)

| Name                          | Required now? | Notes                                     |
| ----------------------------- | ------------- | ----------------------------------------- |
| `NODE_ENV=production`         | Yes           | Set in `wrangler.toml` `[vars]` (done).   |
| `SUPABASE_SERVICE_ROLE_KEY`   | No            | Only when a server fn needs admin scope.  |

Add runtime secrets later with `wrangler secret put NAME`.

---

## 3. Wrangler config

`wrangler.toml` (repo root):
- `name = "getstampd-prod"`
- `main = ".output/server/index.mjs"`
- `compatibility_date = "2025-05-01"`, `nodejs_compat`
- `workers_dev = true` — first deploy is isolated to `workers.dev`
- `[assets] directory = ".output/public"`
- `[vars] NODE_ENV = "production"`
- **ALL zone route blocks are commented out.** Apex/www/app/wildcard routes
  must be uncommented intentionally for the Phase A cutover.

Fill in `account_id` before the first deploy (`wrangler whoami` after `wrangler login`).

---

## 4. First test deploy (workers.dev only — safe, no DNS impact)

> ⚠️ This test deploy hits the **live** Supabase project (the only project
> that exists right now). Reads are RLS-gated by the anon key, but treat any
> write actions during smoke testing as production traffic.

```bash
# One-time setup
bun add -d wrangler
bunx wrangler login
bunx wrangler whoami         # paste account_id into wrangler.toml

# Build with the live Supabase env baked in (VITE_DEPLOY_TARGET is REQUIRED
# for any Cloudflare build — the client's build-time guard refuses to bake
# the hardcoded fallback when this flag is set).
VITE_DEPLOY_TARGET=cloudflare \
VITE_SUPABASE_URL=https://kyjwifumacnrpgyextzz.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<live-anon-jwt> \
  bun run build

# Local smoke against the Worker runtime
bunx wrangler dev

# Test deploy — publishes to https://getstampd-prod.<account>.workers.dev
bunx wrangler deploy
```

**Smoke the workers.dev URL** before touching zone routes:
- `https://getstampd-prod.<account>.workers.dev/` → marketing index
- `/admin` → login screen
- DevTools → Network: Supabase requests go to `kyjwifumacnrpgyextzz.supabase.co`
- Console: no errors

Production hostnames (`getstampd.com.au`, `www`, `app`) are unaffected because
no zone routes are bound.

---

## 5. Production cutover (Phase A — apex + www + app)

Only after the workers.dev test is green:

1. Uncomment the three Phase A `[[routes]]` blocks in `wrangler.toml`
   (apex, `www`, `app`).
2. `bunx wrangler deploy` → routes attach to the zone.
3. In Cloudflare dashboard → DNS, add (proxied / orange-cloud):
   - `A    @    192.0.2.1`
   - `CNAME www  getstampd.com.au`
   - `CNAME app  getstampd.com.au`
4. SSL/TLS → Edge Certificates: confirm Universal SSL is active for the zone.
5. Run the smoke matrix below.

### Phase A smoke tests

| URL                                       | Expected                              |
| ----------------------------------------- | ------------------------------------- |
| `https://getstampd.com.au/`               | Marketing / coming-soon               |
| `https://www.getstampd.com.au/`           | Mirror of apex                        |
| `https://app.getstampd.com.au/`           | Redirects to `/admin`, login renders  |
| `https://app.getstampd.com.au/admin/events` | Deep link works after auth          |
| `https://app.getstampd.com.au/checkin/<token>` | QR flow works on mobile          |

Phase B (tenant wildcard) is a separate change: uncomment the
`*.getstampd.com.au/*` route block, redeploy, add `CNAME * → getstampd.com.au`
(proxied), confirm wildcard SSL covers `*.getstampd.com.au`.

---

## 6. SPA / SSR fallback

Not needed. The Worker SSRs every request via `src/server.ts`. Deep links
(`/admin/events`, `/t/<slug>`, `/checkin/<token>`) render directly.

---

## 7. Rollback

L1 — **Disable Worker routes** (~30s): Cloudflare dashboard → Workers & Pages
→ `getstampd-prod` → Triggers → Routes → delete patterns. Re-point DNS to
Lovable first if you need zero downtime.

L2 — **Revert DNS**: edit Cloudflare DNS to CNAME apex/www/app back to the
previous Lovable custom-domain target (propagation: minutes). Worst case:
change nameservers back at Crazy Domains (propagation: up to 24h).

L3 — **Revert the Worker**: `bunx wrangler rollback`, or redeploy a known-good
git SHA.

### SQL
Tenant-routing SQL is already applied to the live database and is considered
production-ready. Do **not** re-apply `PRODUCTION_BUNDLE.sql` to the same
database; it is not guaranteed idempotent. Rollback never requires touching
SQL. Full clean (only if ever needed):

```sql
DROP FUNCTION IF EXISTS public.resolve_agency_by_subdomain(text);
DROP FUNCTION IF EXISTS public.get_public_event_by_agency_and_slug(text, text);
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_slug_public_subdomain_check;
```

---

## Outstanding before first **production** cutover

1. `wrangler login`, paste `account_id` into `wrangler.toml`.
2. Run the workers.dev test deploy and smoke it (against the live project).
3. Schedule the Phase A DNS window.
4. (Later, post-cutover) provision a separate staging/dev Supabase project and
   re-point Lovable preview/dev at it.
