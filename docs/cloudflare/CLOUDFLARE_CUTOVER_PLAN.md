# Cloudflare Production Cutover — GetStampd

Status: **PLANNING ONLY** — do not deploy, do not change DNS, do not apply
production SQL. This document is the pre-flight audit + execution plan.

Registrar stays on Crazy Domains. Lovable stays as preview/dev. Production
SaaS hosting + wildcard tenant routing moves to Cloudflare Workers.

---

## 1. Build / deploy readiness

| Item                        | Current state                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Build command               | `bun run build` → `vite build`                                                                                 |
| Dev build (preview parity)  | `bun run build:dev` → `vite build --mode development`                                                          |
| Output directory            | `.output/` (nitro). Worker entry: `.output/server/index.mjs`. Static assets: `.output/public/`                 |
| Build target                | **Cloudflare Workers (workerd)** — `@lovable.dev/vite-tanstack-config` already configures nitro `cloudflare-module` |
| SSR entry                   | `src/server.ts` (custom error-wrapping `fetch` handler), wired via `vite.config.ts` `tanstackStart.server.entry` |
| `wrangler.toml` / `.jsonc`  | **Not present.** Must be added before `wrangler deploy` (template below)                                       |
| Node compat                 | Required (`compatibility_flags = ["nodejs_compat"]`) — `jspdf`, `qrcode`, `@supabase/supabase-js` rely on it   |
| Repo changes required       | (a) add `wrangler.toml`, (b) add `.cloudflare/` deploy notes, (c) nothing in app code — host-router + tenant-resolution already done |

**Verification before first deploy** (run locally / in CI, not production):

```bash
bun install
bun run build
ls -la .output/server/index.mjs   # must exist
ls -la .output/public             # static assets bundle
```

The repo already builds for workerd via the Lovable template; no adapter
swap needed.

---

## 2. Environment variables

### Public (safe in client bundle, set as Vite env at build time)

| Name                            | Value (staging today)                       | Notes                                                   |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | `https://<prod-project>.supabase.co`        | **Production** project URL — NOT staging               |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | production `anon` JWT                       | Public by design (gated by RLS)                         |

Today these are **hardcoded** in `src/integrations/supabase/client.ts`
(pointing at staging). Before the production deploy we either:
- (preferred) refactor `client.ts` to read `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` with the current staging values as dev fallback, set the prod values as Cloudflare build-time vars; or
- swap the literals in a dedicated production branch.

> Keep in mind: `import.meta.env.VITE_*` is read at **build time**, not from
> the Worker runtime. Set them in the Cloudflare Pages/Workers build
> environment, not as Worker secrets.

### Server-only runtime (Worker `[vars]` / secrets)

| Name                          | Purpose                                                  | Required? |
| ----------------------------- | -------------------------------------------------------- | --------- |
| `NODE_ENV`                    | `"production"` — read by `src/lib/config.server.ts`      | Yes       |
| `SUPABASE_SERVICE_ROLE_KEY`   | Only if/when a server-fn needs admin scope. **Not used today.** | No (for now) |

No third-party secrets (Stripe, mail, etc.) are wired in the current code
path. Audit again before adding billing/email integrations.

---

## 3. Cloudflare routing config

Recommended **`wrangler.toml`** at repo root:

```toml
name = "getstampd-prod"
main = ".output/server/index.mjs"
compatibility_date = "2025-05-01"
compatibility_flags = ["nodejs_compat"]
account_id = "<fill-in>"

# Serve built static assets directly from the Worker
[assets]
directory = ".output/public"
binding = "ASSETS"

[vars]
NODE_ENV = "production"

# Wildcard SaaS routing — one Worker handles every host under getstampd.com.
# Each route must live under a zone you control (zone = getstampd.com).
[[routes]]
pattern = "getstampd.com/*"
zone_name = "getstampd.com"
custom_domain = false

[[routes]]
pattern = "www.getstampd.com/*"
zone_name = "getstampd.com"
custom_domain = false

[[routes]]
pattern = "app.getstampd.com/*"
zone_name = "getstampd.com"
custom_domain = false

[[routes]]
pattern = "*.getstampd.com/*"
zone_name = "getstampd.com"
custom_domain = false
```

Notes:
- `custom_domain = false` is required. Workers Custom Domains do **not**
  support wildcards. Wildcard hosts must use a Worker **route** attached
  to the zone, with an orange-cloud DNS record that the route matches.
- The apex (`getstampd.com/*`) and the wildcard (`*.getstampd.com/*`) are
  separate routes — `*` does not match the apex.
- Cloudflare auto-issues an Advanced Certificate covering `getstampd.com`
  and `*.getstampd.com` once the zone is active and Universal SSL or an
  Advanced Cert is provisioned. Verify in SSL/TLS → Edge Certificates
  before smoke-testing.

Dashboard equivalent (if not using `wrangler.toml`): Workers & Pages →
your Worker → **Settings → Triggers → Routes** → add all four patterns,
zone `getstampd.com`.

---

## 4. SPA / SSR fallback

The Worker runs SSR on **every** request via `src/server.ts`, so direct
hits to deep links are served correctly — there is no `index.html` SPA
fallback to configure.

| Direct URL                                                              | Path served | Notes |
| ----------------------------------------------------------------------- | ----------- | ----- |
| `app.getstampd.com/admin/events`                                        | HostRouter rewrites `/` → `/admin` on `app` host; `/admin/events` is untouched and renders directly | ✅ |
| `getstampd.com/t/ready-marketing`                                       | Renders `src/routes/t.$agencySlug.tsx`        | ✅ |
| `getstampd.com/t/ready-marketing/e/orange-wine-festival-test`           | Renders `src/routes/t.$agencySlug.e.$eventSlug.tsx` | ✅ |
| `ready-marketing.getstampd.com/e/orange-wine-festival-test`             | HostRouter rewrites to `/t/ready-marketing/e/orange-wine-festival-test` client-side; SSR serves the `/` shell, then JS replaces. | ⚠️ Acceptable, but server-side rewrite is a future improvement. |

> First-paint caveat: HostRouter rewrites happen post-hydration. For
> tenant-host deep links the SSR HTML is the apex `/` page for ~50ms before
> the JS rewrite fires. This matches the staging behavior signed off.

---

## 5. DNS plan (Cloudflare DNS — do not apply yet)

Pre-requisite: move `getstampd.com` nameservers from Crazy Domains to
Cloudflare (Cloudflare provides the two NS values during zone setup).

| Type  | Name | Content                  | Proxy   | Purpose                          |
| ----- | ---- | ------------------------ | ------- | -------------------------------- |
| A     | `@`  | `192.0.2.1` (placeholder)| Proxied | Apex — Worker route catches it   |
| CNAME | `www`| `getstampd.com`          | Proxied | `www` → Worker route             |
| CNAME | `app`| `getstampd.com`          | Proxied | `app` → Worker route             |
| CNAME | `*`  | `getstampd.com`          | Proxied | Wildcard → tenant Worker route   |

The A record IP is a placeholder — when a record is **proxied** and a
matching Worker route exists, Cloudflare routes the request to the Worker
regardless of the origin IP. `192.0.2.1` (TEST-NET-1) is the conventional
safe stand-in.

Apex CNAME flattening: if you'd rather use a CNAME at the apex, Cloudflare
will flatten it; either approach works.

**Reserved labels** already handled in code (`src/lib/reserved-subdomains.ts`):
`www`, `app`, `admin`, `api`, `mail`, `static`, `assets`, `cdn`, etc. The
wildcard DNS + wildcard route will serve those hostnames too, but HostRouter
classifies them as `reserved` / `app` / `root` and does not treat them as
tenant slugs.

Also add (optional, recommended):
- CAA record allowing `letsencrypt.org` and `pki.goog` (Cloudflare's CAs).
- Email DNS (MX, SPF, DKIM, DMARC) — copy verbatim from Crazy Domains so mail keeps flowing.

---

## 6. Smoke test plan (run AFTER deploy + DNS cutover, BEFORE announcing)

For each URL: (a) HTTPS cert valid, (b) HTTP 200 or expected redirect,
(c) correct content, (d) no console errors, (e) Supabase calls succeed.

| URL                                                                       | Expected                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `https://getstampd.com/`                                                  | Coming-soon / marketing index                                  |
| `https://www.getstampd.com/`                                              | Mirror of apex                                                 |
| `https://app.getstampd.com/`                                              | Redirects to `/admin`, login screen renders                    |
| `https://events.getstampd.com/`                                           | Classified as tenant `events` → `/t/events`; tenant-not-found UI if no agency `events` exists |
| `https://ready-marketing.getstampd.com/`                                  | `/t/ready-marketing` — agency workspace                        |
| `https://ready-marketing.getstampd.com/e/orange-wine-festival-test`       | Event public page renders                                      |
| `https://unknownslug.getstampd.com/`                                      | Branded "workspace not found" (no crash, valid cert)           |
| `https://<legacyEventSubdomain>.getstampd.com/live/<legacyEventSubdomain>`| Legacy `/live/*` path still resolves via `event_domains`        |
| `https://app.getstampd.com/admin/events`                                  | Direct deep link → admin events list (after auth)              |
| `https://ready-marketing.getstampd.com/checkin/<token>`                   | QR check-in flow — untouched by HostRouter                     |

Also verify:
- `curl -I https://anyrandom.getstampd.com` returns a valid cert (wildcard SSL).
- Diagnostic panel (platform_admin only) reports correct host classification on each.
- Supabase requests in the Network panel go to the **production** project URL.

---

## 7. Rollback plan

Ranked least-destructive → most-destructive. Stop at the first level that
restores service.

### Level 1 — Disable Worker tenant routing (fastest, ~30s)

In Cloudflare dashboard → Workers & Pages → `getstampd-prod` → Triggers →
Routes: **delete** or **disable** the four route patterns. Cloudflare
returns the zone to standard DNS behavior (origin = the A/CNAME content).
Since DNS points to a placeholder IP, requests will fail closed — set the
apex/www A records to the previous Lovable target as a fallback before
disabling routes, or skip to Level 2.

### Level 2 — Revert DNS

Either (a) edit DNS records in Cloudflare to point back at the previous
Lovable hosting targets (CNAME `cname.lovable.app` or equivalent), or
(b) at the registrar (Crazy Domains) change nameservers back to the
pre-Cloudflare NS values. Propagation: option (a) is minutes (Cloudflare
has low TTL), option (b) is up to 24h.

### Level 3 — Revert app deployment

`wrangler rollback` to the prior Worker version, or redeploy from a known-good
git SHA. The Worker version history in the dashboard lists every deploy.

### Production SQL

The tenant-routing SQL bundle (`PRODUCTION_BUNDLE.sql`) is **non-destructive
and can stay in place** regardless of rollback level:
- `01` + `02` create RPCs that legacy code paths do not call.
- `03` adds a `NOT VALID` `CHECK` constraint on `agencies.public_subdomain`
  — does not affect existing rows and does not block writes that satisfy it.
- No data migration, no column drops, no policy changes.

If full rollback is required, the RPCs can be dropped with:

```sql
DROP FUNCTION IF EXISTS public.resolve_agency_by_subdomain(text);
DROP FUNCTION IF EXISTS public.get_public_event_by_agency_and_slug(text, text);
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_slug_public_subdomain_check;
```

But this is not required for app-level rollback.

---

## Open items before deploy

1. Decide: refactor `src/integrations/supabase/client.ts` to read from
   `import.meta.env`, or branch-swap literals. (Recommend refactor.)
2. Capture production Supabase URL + anon key, store in Cloudflare build env.
3. Create Cloudflare account / zone, obtain `account_id`, paste into
   `wrangler.toml`.
4. Confirm wildcard SSL is active on the zone (Universal SSL covers
   `*.getstampd.com` automatically; verify before cutover).
5. Plan a maintenance window or low-traffic slot for DNS NS change.

No code has been changed by this audit. No DNS, no SQL, no deploy.
