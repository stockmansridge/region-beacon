# Cloudflare Production Deployment — GetStampd (getstampd.com.au)

Status: **PREP ONLY**. Cloudflare DNS is now authoritative for `getstampd.com.au`
(nameservers cut over at Crazy Domains). No Worker is deployed, no records
added beyond what Cloudflare imported, no production SQL applied.

Lovable remains preview/dev. Cloudflare becomes production hosting + routing.

> Note: the older draft `CLOUDFLARE_CUTOVER_PLAN.md` referenced `getstampd.com`.
> Production is **`getstampd.com.au`**. This document supersedes that one for
> the active cutover. The `.com` apex stays parked for future use.

---

## 1. Build

| Item                      | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| Install                   | `bun install`                                                      |
| Production build          | `bun run build`                                                    |
| Worker entry (output)     | `.output/server/index.mjs`                                         |
| Static assets (output)    | `.output/public/`                                                  |
| Build target              | Cloudflare Workers (workerd) via nitro `cloudflare-module` (preset configured by `@lovable.dev/vite-tanstack-config`) |
| Node compat               | Required — `compatibility_flags = ["nodejs_compat"]` (jspdf, qrcode, supabase-js) |

Local verification before first deploy:

```bash
bun install
bun run build
ls -la .output/server/index.mjs   # must exist
ls -la .output/public             # must exist
```

No app code change required for build target. `wrangler.toml` is committed at
repo root.

---

## 2. Wrangler config

`wrangler.toml` (repo root) contains:
- `name = "getstampd-prod"`
- `main = ".output/server/index.mjs"`
- `compatibility_date = "2025-05-01"`, `nodejs_compat`
- `[assets] directory = ".output/public"`
- `[vars] NODE_ENV = "production"`
- Worker routes for apex, `www`, `app` (wildcard route present but commented
  out — enable in Phase B together with the `*` DNS record).

Fill in `account_id` before the first `wrangler deploy`. Obtain via
`wrangler whoami` after `wrangler login`.

---

## 3. Environment variables

### Build-time (Vite — set in the build environment that runs `bun run build`)

| Name                            | Source                                      |
| ------------------------------- | ------------------------------------------- |
| `VITE_SUPABASE_URL`             | Production Supabase project URL             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Production Supabase `anon` JWT (public)     |

**Today** these are hardcoded in `src/integrations/supabase/client.ts` and
point at **staging**. Before the production build, either:
- (recommended) refactor `client.ts` to read `import.meta.env.VITE_SUPABASE_URL`
  / `VITE_SUPABASE_PUBLISHABLE_KEY` with the current staging values as the
  dev fallback, then set the prod values in the Cloudflare build environment; or
- branch-swap the literals for the production deploy.

This is the **only blocker** between repo state and a valid production build.

### Runtime (Worker `[vars]` or secrets)

| Name                          | Required now? | Notes                                  |
| ----------------------------- | ------------- | -------------------------------------- |
| `NODE_ENV=production`         | Yes           | Set in `wrangler.toml [vars]` (done).  |
| `SUPABASE_SERVICE_ROLE_KEY`   | No            | Only if a server fn needs admin scope. |
| Stripe / mail / etc.          | No            | Not wired in current code paths.       |

Add runtime secrets with `wrangler secret put NAME` only when a code path
needs them.

---

## 4. Worker routes (Phase A — apex + www + app)

Routes already declared in `wrangler.toml`. After first `wrangler deploy`
they bind automatically to the zone. Verify in Cloudflare dashboard →
Workers & Pages → `getstampd-prod` → Settings → Triggers → Routes:

| Pattern                          | Zone               | Custom domain |
| -------------------------------- | ------------------ | ------------- |
| `getstampd.com.au/*`             | `getstampd.com.au` | no            |
| `www.getstampd.com.au/*`         | `getstampd.com.au` | no            |
| `app.getstampd.com.au/*`         | `getstampd.com.au` | no            |

For each route to fire, the zone must have a **proxied** (orange-cloud) DNS
record for the matching hostname. Phase A records (add when ready — *do not
add yet per current instruction*):

| Type  | Name | Content       | Proxy   |
| ----- | ---- | ------------- | ------- |
| A     | `@`  | `192.0.2.1`   | Proxied |
| CNAME | `www`| `getstampd.com.au` | Proxied |
| CNAME | `app`| `getstampd.com.au` | Proxied |

`192.0.2.1` (TEST-NET-1) is a documented placeholder; Cloudflare routes
proxied traffic to the Worker regardless of origin IP when a matching route
exists.

**Phase B** (tenant subdomains — enable later, together):
1. Uncomment the `*.getstampd.com.au/*` block in `wrangler.toml` and redeploy.
2. Add `CNAME *  →  getstampd.com.au` (Proxied).
3. Verify wildcard SSL covers `*.getstampd.com.au` (SSL/TLS → Edge Certificates).

---

## 5. SPA / SSR fallback

No SPA fallback needed. The Worker runs SSR on every request via
`src/server.ts`, so direct hits to any route (`/admin/events`,
`/t/ready-marketing`, `/checkin/<token>`, etc.) render correctly without an
`index.html` rewrite rule. HostRouter (`src/components/host-router.tsx`)
classifies hostnames client-side after hydration; the reserved-subdomain
table already handles `www`, `app`, `admin`, etc.

For tenant hosts in Phase B, SSR initially serves the apex `/` shell and
HostRouter rewrites client-side (~50ms). This matches the staging behavior
already signed off.

---

## 6. Deployment steps

When ready to ship (do **not** run yet):

```bash
# One-time
bun add -d wrangler
bunx wrangler login                    # browser auth
bunx wrangler whoami                   # copy account_id into wrangler.toml

# Build with PRODUCTION env vars
VITE_SUPABASE_URL=https://<prod>.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<prod-anon-jwt> \
  bun run build

# Smoke-test the bundle locally against the Worker runtime
bunx wrangler dev

# Deploy
bunx wrangler deploy
```

Then in Cloudflare dashboard:
1. Confirm routes are bound to the Worker (Workers & Pages → getstampd-prod → Triggers).
2. Add the Phase A DNS records (apex, www, app) — proxied.
3. Confirm SSL/TLS mode is **Full (strict)** and Universal SSL is active.
4. Run the smoke test matrix (§7).
5. Only after Phase A is green: enable Phase B route + wildcard DNS.

---

## 7. Smoke tests (Phase A)

For each: cert valid, expected status, content correct, no console errors,
Supabase calls hit production project.

| URL                                      | Expected                                   |
| ---------------------------------------- | ------------------------------------------ |
| `https://getstampd.com.au/`              | Marketing / coming-soon index              |
| `https://www.getstampd.com.au/`          | Mirror of apex                             |
| `https://app.getstampd.com.au/`          | Redirects to `/admin`, login renders       |
| `https://app.getstampd.com.au/admin/events` | Deep link works after auth              |
| `https://app.getstampd.com.au/checkin/<token>` | QR flow still works on mobile         |

Legacy `/live/<subdomain>` URLs continue to work via the existing
`event_domains` flow — they do not depend on Phase B wildcard routing.

---

## 8. Rollback

Ranked least → most disruptive. Stop at the first level that restores service.

### Level 1 — Disable Worker routes (~30s)
Cloudflare dashboard → Workers & Pages → `getstampd-prod` → Triggers →
Routes → delete/disable the route patterns. Requests to the proxied DNS
records then return Cloudflare default origin behavior. Before disabling,
either repoint the apex/www/app DNS records to the previous Lovable target
(CNAME to the Lovable custom-domain host), or accept downtime until DNS is
fixed.

### Level 2 — Revert DNS
Option A (fast): edit Cloudflare DNS records to point back at Lovable's
custom-domain target (CNAME values from Lovable → Project → Custom Domain).
Propagation is minutes inside Cloudflare.
Option B (slow): change nameservers at Crazy Domains back to the
pre-Cloudflare NS values. Propagation up to 24h.

### Level 3 — Revert the Worker
`bunx wrangler rollback` (or redeploy a known-good git SHA). The Worker
version history is in the Cloudflare dashboard.

### Production SQL
The tenant-routing bundle (`supabase/migrations-draft-tenant-routing/PRODUCTION_BUNDLE.sql`)
is non-destructive and not yet applied. Rollback at any Cloudflare level
does **not** require touching SQL. If a full clean is ever needed:

```sql
DROP FUNCTION IF EXISTS public.resolve_agency_by_subdomain(text);
DROP FUNCTION IF EXISTS public.get_public_event_by_agency_and_slug(text, text);
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_slug_public_subdomain_check;
```

---

## Outstanding before first production deploy

1. Refactor `src/integrations/supabase/client.ts` to read prod URL + anon
   key from `import.meta.env` (or plan the branch-swap).
2. Capture production Supabase URL + anon key.
3. `wrangler login`, paste `account_id` into `wrangler.toml`.
4. Pick a low-traffic window for adding Phase A DNS records.
5. Decide who runs `wrangler deploy` and from where (CI vs local).

No DNS records added beyond Cloudflare's import. No wildcard yet. No
production SQL applied.
