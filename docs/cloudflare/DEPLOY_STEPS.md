# Cloudflare Production Deployment — GetStampd (getstampd.com.au)

## Surfaces — read this first

| Surface | URL | Updated by |
|---|---|---|
| Editor workspace (iframe may cache) | `https://lovable.dev/projects/481bb391-4845-4595-9174-36e7e5516010` | n/a |
| **Direct preview app — canonical test** | `https://id-preview--481bb391-4845-4595-9174-36e7e5516010.lovable.app` | Every commit (auto) |
| Lovable published app (not used for production) | `https://region-beacon.lovable.app` | Lovable **Publish** button |
| **Production** | `https://getstampd.com.au` | **GitHub Actions → "Deploy GetStampd Cloudflare Worker"** |

Lovable **Publish** does **not** update `getstampd.com.au`. The custom domain is bound to the self-hosted Cloudflare Worker via `[[routes]]` in `wrangler.toml`; only a `wrangler deploy` updates it. Use the GitHub Action below for one-click deploys.

---

## One-click production deploy (GitHub Action)

File: `.github/workflows/deploy-cloudflare-worker.yml`

**How to deploy:**
1. Verify the change on the direct preview URL (`id-preview--…lovable.app`) and confirm the `BUILD_MARKER` is what you expect.
2. Push/sync to GitHub (`stockmansridge/region-beacon`).
3. GitHub → **Actions** tab → left sidebar **"Deploy GetStampd Cloudflare Worker"** → **Run workflow** button (top right) → pick branch (usually `main`) → **Run workflow**.
4. Wait ~2–4 min. The job summary prints the commit, timestamp, and the live `/debug/worker-health` JSON.
5. Open `https://getstampd.com.au/admin` and confirm the amber `BUILD_MARKER` bar matches preview.

**Required GitHub repository secrets** (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → Create Token → template **"Edit Cloudflare Workers"** (or custom token with `Account.Workers Scripts:Edit` + `Zone.Workers Routes:Edit` for `getstampd.com.au`). |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → any Workers or zone page → right sidebar → **Account ID** copy button. |
| `VITE_SUPABASE_URL` | `https://kyjwifumacnrpgyextzz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The anon JWT — `CURRENT_PROJECT_PUBLISHABLE_KEY` in `src/integrations/supabase/client.ts`. |

The Worker name is **`region-beacon`** (per `wrangler.toml`). Zone routes for apex / `www` / `app` / `*.getstampd.com.au` are already active in `wrangler.toml`, so the first successful run of this workflow updates the live custom domain.

**GitHub connection requirement:** the workflow only runs if this Lovable project is connected to the GitHub repo `stockmansridge/region-beacon`. If it's not connected: Lovable editor → **+** menu (bottom-left of chat) → **GitHub** → Connect project, then push. Without the connection the YAML file exists in the Lovable internal git only and GitHub will never see it.

---

## Manual / legacy reference (Cloudflare Dashboard GitHub integration)

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
| Worker entry       | `dist/server/index.mjs`                                                                     |
| Static assets      | `dist/client/`                                                                              |
| Generated config   | `dist/server/wrangler.json` (+ `.wrangler/deploy/config.json` pointer) — wrangler picks this up automatically; the root `wrangler.toml` is overridden (nitro emits a WARN saying so) |
| Target             | Cloudflare Workers (workerd) via nitro `cloudflare-module` preset, force-enabled by `nitro: true` in `vite.config.ts` |
| Node compat        | Required — `compatibility_flags = ["nodejs_compat"]`                                        |

> **Why `nitro: true` is required:** `@lovable.dev/vite-tanstack-config`
> auto-detects the Lovable sandbox and only runs the nitro deploy plugin
> there. Cloudflare's GitHub-based build pipeline is *not* a Lovable context,
> so without `nitro: true` the build emits a plain Vite `dist/` (no Worker
> entry) and wrangler fails with `entry-point file at ".output/server/index.mjs"
> was not found` (or whatever path you guessed). `vite.config.ts` now passes
> `nitro: true` explicitly so every environment produces the same Worker
> bundle.


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

For Cloudflare, these values are set in the **Cloudflare Dashboard** as
build-time variables on the Worker project (see §4.2 below). No local
terminal step is required.

The current/live Supabase project values (used for both the workers.dev
test deploy and the eventual production cutover):

- `VITE_SUPABASE_URL`             = `https://kyjwifumacnrpgyextzz.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the anon JWT hardcoded in
  `src/integrations/supabase/client.ts` (`CURRENT_PROJECT_PUBLISHABLE_KEY`)
- `VITE_DEPLOY_TARGET`            = `cloudflare`

Lovable preview/dev keeps working with no env wiring — `VITE_DEPLOY_TARGET`
is unset there, so the cloudflare guard doesn't fire and the hardcoded
fallback (= live project) is used.

### Runtime env (Worker `[vars]` / secrets)

| Name                        | Required now? | Notes                                              |
| --------------------------- | ------------- | -------------------------------------------------- |
| `NODE_ENV=production`       | Yes           | Set in `wrangler.toml` `[vars]` (done).            |
| `SUPABASE_SERVICE_ROLE_KEY` | No            | Only when a server fn needs admin scope. Add via Dashboard → Worker → **Settings → Variables and Secrets → Runtime secrets**. |


---

## 3. Wrangler config (used by Cloudflare's GitHub-based build)

`wrangler.toml` (repo root):
- `name = "getstampd-prod"`
- `main = "dist/server/index.mjs"`
- `compatibility_date = "2025-05-01"`, `nodejs_compat`
- `workers_dev = true` — first deploy is isolated to `workers.dev`
- `[assets] directory = "dist/client"`
- `[vars] NODE_ENV = "production"`
- `[observability]` + `[observability.logs]` — `enabled = true`,
  `invocation_logs = true`, `head_sampling_rate = 1`. Mirrored into the
  Nitro-generated `dist/server/wrangler.json` by
  `scripts/patch-wrangler-observability.mjs` (runs as part of `bun run build`),
  so the settings survive Nitro overriding the root `wrangler.toml`.
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
