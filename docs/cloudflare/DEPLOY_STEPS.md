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

## 3. Wrangler config (used by Cloudflare's GitHub-based build)

`wrangler.toml` (repo root):
- `name = "getstampd-prod"`
- `main = ".output/server/index.mjs"`
- `compatibility_date = "2025-05-01"`, `nodejs_compat`
- `workers_dev = true` — first deploy is isolated to `workers.dev`
- `[assets] directory = ".output/public"`
- `[vars] NODE_ENV = "production"`
- **ALL zone route blocks remain commented out.** Apex/www/app/wildcard
  routes will only be uncommented intentionally for the Phase A cutover.

`account_id` does **not** need to be hardcoded when Cloudflare builds from
GitHub — the connected account is implicit. Leave the `account_id` line
commented. (If you ever need it: Cloudflare Dashboard → right sidebar of any
Workers/Overview or zone page shows **Account ID** with a copy button.)

---

## 4. First test deploy — Cloudflare Dashboard + GitHub (workers.dev only)

> ⚠️ This test deploy hits the **live** Supabase project (the only project
> that exists right now). Reads are RLS-gated by the anon key, but treat any
> write actions during smoke testing as production traffic.

Cloudflare can build and deploy this Worker directly from GitHub using the
existing `wrangler.toml`. No local terminal, no `wrangler login`, no
PowerShell required.

### 4.1 Connect the GitHub repo to Cloudflare

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Workers** tab
   → **Import a repository** (under "Connect to Git").
2. Authorize the **Cloudflare GitHub App** for the org/account that owns
   this repo. Grant access to this single repository.
3. Pick the repo. Cloudflare detects `wrangler.toml` and proposes:
   - Project name: `getstampd-prod` (matches `name` in `wrangler.toml` —
     keep it identical so the workers.dev subdomain is predictable).
   - Production branch: pick the branch you want auto-deployed (typically
     `main`). Preview branches can be left default.
4. Build settings:
   - **Build command:** `bun install && bun run build`
   - **Deploy command:** *(leave Cloudflare's default — it runs
     `wrangler deploy` using the repo's `wrangler.toml`)*
   - **Root directory:** `/` (repo root)
   - Node/Bun version: Cloudflare auto-detects from the lockfile; no override
     needed.

### 4.2 Set build environment variables (Dashboard)

In the same setup screen (or later under **Settings → Variables and
Secrets → Build-time variables**), add these three for the **Production**
environment:

| Name                            | Value                                                                                       | Type      |
| ------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| `VITE_DEPLOY_TARGET`            | `cloudflare`                                                                                | Plaintext |
| `VITE_SUPABASE_URL`             | `https://kyjwifumacnrpgyextzz.supabase.co`                                                  | Plaintext |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the anon JWT (`CURRENT_PROJECT_PUBLISHABLE_KEY` in `src/integrations/supabase/client.ts`)   | **Secret** |

Notes:
- These are **build-time** variables — Vite inlines them into the bundle
  during `bun run build`. They are not the same as Worker runtime `[vars]`
  or runtime secrets.
- The anon/publishable key is safe in client bundles by design, but storing
  it as a Secret in the Dashboard keeps it out of build logs.
- Do **not** add `SUPABASE_SERVICE_ROLE_KEY` here. If/when needed it goes
  under **Runtime secrets** (separate section in the Dashboard), never as
  a `VITE_*` build var.

### 4.3 Trigger the first deploy

1. Save the project. Cloudflare runs the first build automatically against
   the production branch.
2. Watch **Deployments → (latest) → Build log**. Expected:
   - `bun install` completes.
   - `bun run build` produces `.output/server/index.mjs` and `.output/public/`.
   - `wrangler deploy` publishes the Worker. Because `workers_dev = true`
     and every `[[routes]]` block is commented out, it binds **only** to
     `https://getstampd-prod.<account-subdomain>.workers.dev`.
3. Confirm in **Workers & Pages → getstampd-prod → Triggers**:
   - **Routes:** empty (none attached to the zone).
   - **Custom Domains:** empty.
   - **workers.dev:** enabled, URL shown.

Zero impact on `getstampd.com.au` — no zone route is bound.

### 4.4 Dashboard-only smoke test

Open the workers.dev URL Cloudflare shows in **Deployments**:

| Check                          | Where                                                                | Expected                                                           |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Worker responds                | Browser → `https://getstampd-prod.<acct>.workers.dev/`               | Marketing index renders (SSR, not a blank shell)                   |
| Deep link SSR                  | Browser → `/admin`                                                   | Login screen renders directly                                      |
| Supabase wiring                | Browser DevTools → Network                                           | XHR/fetch to `kyjwifumacnrpgyextzz.supabase.co` returns 200/206    |
| No build-guard misfire         | Browser DevTools → Console                                           | No `VITE_DEPLOY_TARGET=cloudflare requires …` error, no red errors |
| Worker logs clean              | Dashboard → Workers & Pages → getstampd-prod → **Logs** (Live tail)  | No 5xx, no unhandled exceptions while clicking around              |
| Build vars baked correctly     | Dashboard → Deployments → latest → **Build log**                     | Build completed; no "Missing VITE_SUPABASE_*" thrown               |
| Routes still detached          | Dashboard → getstampd-prod → **Triggers**                            | Routes list empty; only workers.dev URL is bound                   |
| DNS untouched                  | Dashboard → `getstampd.com.au` zone → **DNS**                        | No new A/CNAME for apex/www/app/wildcard added by this deploy      |

If anything fails, see Rollback (§7). Do not proceed to the cutover until
every row is green.

---

## 5. Production cutover (Phase A — apex + www + app) — **NOT YET**

Only after the workers.dev test is green and you explicitly approve cutover:

1. In the repo, uncomment the three Phase A `[[routes]]` blocks in
   `wrangler.toml` (apex, `www`, `app`). Commit & push — Cloudflare's GitHub
   integration rebuilds and redeploys automatically.
2. Cloudflare Dashboard → `getstampd.com.au` zone → **DNS** → add (Proxied /
   orange-cloud):
   - `A     @     192.0.2.1`
   - `CNAME www   getstampd.com.au`
   - `CNAME app   getstampd.com.au`
3. **SSL/TLS → Edge Certificates:** confirm Universal SSL is Active.
4. Run the Phase A smoke matrix.

### Phase A smoke tests

| URL                                            | Expected                              |
| ---------------------------------------------- | ------------------------------------- |
| `https://getstampd.com.au/`                    | Marketing / coming-soon               |
| `https://www.getstampd.com.au/`                | Mirror of apex                        |
| `https://app.getstampd.com.au/`                | Redirects to `/admin`, login renders  |
| `https://app.getstampd.com.au/admin/events`    | Deep link works after auth            |
| `https://app.getstampd.com.au/checkin/<token>` | QR flow works on mobile               |

Phase B (tenant wildcard) is a separate change: uncomment the
`*.getstampd.com.au/*` route block, push, add `CNAME * → getstampd.com.au`
(proxied), confirm wildcard SSL covers `*.getstampd.com.au`.

---

## 6. SPA / SSR fallback

Not needed. The Worker SSRs every request via `src/server.ts`. Deep links
(`/admin/events`, `/t/<slug>`, `/checkin/<token>`) render directly.

---

## 7. Rollback (Dashboard-only)

**L1 — Detach routes (~30s):** Dashboard → Workers & Pages →
`getstampd-prod` → **Triggers** → **Routes** → delete the patterns. Apex/www/
app stop hitting the Worker immediately.

**L2 — Revert DNS:** Dashboard → `getstampd.com.au` zone → **DNS** → edit
apex/www/app records back to the previous Lovable custom-domain target
(propagation: minutes, since Cloudflare is authoritative). Worst case:
change nameservers back at Crazy Domains (propagation: up to 24h).

**L3 — Roll back the Worker:** Dashboard → Workers & Pages →
`getstampd-prod` → **Deployments** → pick a previous green deployment →
**Rollback**. Or revert the commit on the production branch — Cloudflare's
GitHub integration redeploys the prior code automatically.

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

1. Connect the GitHub repo to Cloudflare (§4.1) and set the three build vars
   (§4.2) in the Dashboard.
2. Trigger the workers.dev deploy from the Dashboard and run the smoke
   matrix (§4.4) against the live Supabase project.
3. Schedule the Phase A DNS window — only then uncomment routes (§5).
4. (Later, post-cutover) provision a separate staging/dev Supabase project
   and re-point Lovable preview/dev at it.
