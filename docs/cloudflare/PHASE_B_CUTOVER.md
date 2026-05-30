# Phase B Cloudflare Cutover — wildcard tenant routing

**Status: ✅ COMPLETE — Phase B is live in production.**

Wildcard DNS (`* CNAME → getstampd.com.au`, proxied) and the
`*.getstampd.com.au/*` Worker route are both active. `wrangler.toml`
persists the Phase B `[[routes]]` block so subsequent deploys re-assert
the route from config. `workers_dev` remains `true`. Phase A routes are
unchanged. No SQL was applied and no Lovable custom-domain records were
removed.

Scope: route every `*.getstampd.com.au` subdomain (other than the apex /
`www` / `app` already covered in Phase A) through the `region-beacon`
Cloudflare Worker so tenant agency workspaces resolve.

**Out of scope for Phase B:**
- SQL changes (no migrations applied, no `NOT VALID` constraint validated).
- Removing or detaching any Lovable custom-domain binding — leave them in
  place as rollback insurance.
- Any change to apex / `www` / `app` DNS or Worker routes (Phase A stays as-is).

Prerequisite: Phase A is green. `getstampd.com.au`, `www.getstampd.com.au`,
and `app.getstampd.com.au` all serve from the Worker, and
`/debug/worker-health` returns `ok: true` on each.

---

## 1. Exact DNS wildcard record

Cloudflare Dashboard → `getstampd.com.au` zone → **DNS → Records → Add record**.

| Type  | Name | Target / Content   | Proxy   | TTL  |
| ----- | ---- | ------------------ | ------- | ---- |
| CNAME | `*`  | `getstampd.com.au` | Proxied | Auto |

Notes:
- Must be **Proxied (orange cloud)** — a grey-cloud wildcard will bypass
  the Worker and the route will not fire.
- Do **not** add a wildcard `A` record. One proxied wildcard `CNAME` is
  sufficient and is what Cloudflare recommends.
- Existing apex / `www` / `app` records from Phase A take precedence over
  the wildcard — do **not** delete or modify them.
- Do **not** remove the Lovable Cloud / Lovable custom-domain records that
  are not part of Phase A or B. They remain in place for rollback.

SSL/TLS: Universal SSL already covers `*.getstampd.com.au` (verified in
Phase A). No certificate order required.

---

## 2. Exact Worker route to add

Cloudflare Dashboard → **Workers & Pages → region-beacon → Settings →
Domains & Routes → Add → Route**.

| Field         | Value                       |
| ------------- | --------------------------- |
| Zone          | `getstampd.com.au`          |
| Route         | `*.getstampd.com.au/*`      |
| Worker        | `region-beacon`             |
| Failure mode  | Fail closed (default)       |

Repo side: uncomment the Phase B block in `wrangler.toml`:

```toml
[[routes]]
pattern = "*.getstampd.com.au/*"
zone_name = "getstampd.com.au"
custom_domain = false
```

Then push so the next deploy re-asserts the route from config. Keep
`workers_dev = true` on for now.

The Phase A `[[routes]]` blocks (apex, `www`, `app`) stay uncommented and
unchanged. The wildcard route does **not** match those hostnames because
Cloudflare prefers the more specific route.

---

## 3. Expected results per host

All checks assume cache busted (curl, or hard refresh in a clean browser
profile). Allow 30–60s after DNS save for the wildcard to propagate inside
Cloudflare's edge.

### `ready-marketing.getstampd.com.au/`
- Worker route matches → Worker fetch runs.
- `classifyHost` → `{ kind: "tenant", subdomain: "ready-marketing" }`.
- Client `HostRouter` rewrites `/` → `/t/ready-marketing`.
- `/t/$agencySlug` calls `resolveAgencyBySubdomain("ready-marketing")`.
- **If the tenant-routing RPC is live and an agency with slug
  `ready-marketing` exists** → renders the agency workspace landing.
- **If the RPC is not yet deployed OR no such agency** → falls back to
  the legacy `event_domains` lookup via `resolveLegacyEventForSubdomain`,
  then a branded "workspace not found" screen. No 500.

### `ready-marketing.getstampd.com.au/e/orange-wine-festival-test`
- Same classification as above (`tenant` / `ready-marketing`).
- `HostRouter` rewrites `/e/orange-wine-festival-test` →
  `/t/ready-marketing/e/orange-wine-festival-test`.
- `/t/$agencySlug/e/$eventSlug` calls
  `get_public_event_by_agency_and_slug`.
- **If the tenant-routing migration is applied and that event is
  published** → renders the event page.
- **Otherwise** → branded not-found, no crash.

### `unknownslug.getstampd.com.au/`
- Wildcard DNS + Worker route still match (Cloudflare cannot tell that
  the slug is "unknown" — that is application logic).
- `classifyHost` → `{ kind: "tenant", subdomain: "unknownslug" }`.
- `/t/unknownslug` → RPC returns no row → legacy lookup returns no row →
  branded "workspace not found". HTTP 200 with a friendly page, not 404
  at the edge and not a 500.

### `events.getstampd.com.au/`
- DNS wildcard + Worker route match.
- `classifyHost` short-circuits on the **reserved subdomain** list
  (`src/lib/reserved-subdomains.ts` includes `events`) →
  `{ kind: "reserved", sub: "events" }`.
- `HostRouter` performs **no rewrite**. The root `/` route renders
  (currently the coming-soon / marketing landing).
- This is intentional: `events` is reserved and must never resolve to a
  tenant named "events".

Worker health check — should pass on every tenant host:

```
curl -i https://ready-marketing.getstampd.com.au/debug/worker-health
curl -i https://unknownslug.getstampd.com.au/debug/worker-health
curl -i https://events.getstampd.com.au/debug/worker-health
```

All three should return `200` with `runtime: "cloudflare-worker"` and the
respective `host` echoed back. If any returns Cloudflare's default error
page (1000-series), the wildcard DNS record or the Worker route is
misconfigured.

---

## 4. Rollback steps

Ordered from least to most disruptive. Each level is independently
reversible and resolves within Cloudflare's edge cache (~30s). **No SQL,
no code revert, no Lovable detach required.**

**L1 — Disable tenant routing only (keep Phase A live):**
1. Dashboard → Workers & Pages → region-beacon → Domains & Routes →
   delete the `*.getstampd.com.au/*` route.
2. Re-comment the Phase B `[[routes]]` block in `wrangler.toml` and push,
   so the next deploy does not re-add it.
3. Tenant hosts immediately stop hitting the Worker. They now fall back
   to whatever the wildcard DNS resolves to (still Cloudflare, but with
   no Worker → 522/1016-style edge response).

**L2 — Remove wildcard DNS entirely (full Phase B revert):**
1. Dashboard → DNS → Records → delete the `*` CNAME.
2. After this, `anything.getstampd.com.au` returns NXDOMAIN. Apex /
   `www` / `app` continue to work normally (Phase A unaffected).

**L3 — Pause Cloudflare proxy on the wildcard (keep record, stop proxying):**
1. Dashboard → DNS → Records → edit `*` CNAME → toggle proxy to
   **DNS only (grey cloud)**.
2. Useful only if you want the wildcard to resolve but bypass the Worker
   (e.g. to test a different origin). Worker route still won't fire.

**L4 — Nuclear (zone pause):** Dashboard → Overview → "Pause Cloudflare
on Site". Disables all Cloudflare features for the zone. Last resort.

Do **not** remove the Lovable custom-domain records as part of Phase B
rollback — they were not touched in Phase A or B and removing them would
break the documented Phase A rollback path.

---

## 5. Host Diagnostic checks

The platform-admin-only Host Diagnostic panel (`src/components/host-diagnostic.tsx`,
backed by `describeHost` in `host-router.tsx`) is the single source of
truth for what the app thinks about the current host. Open it as a
platform admin on each test host and verify:

| Host                                                     | `classification` | `subdomain`        | `rewriteTo`                                           |
| -------------------------------------------------------- | ---------------- | ------------------ | ----------------------------------------------------- |
| `ready-marketing.getstampd.com.au/`                      | `tenant`         | `ready-marketing`  | `/t/ready-marketing`                                  |
| `ready-marketing.getstampd.com.au/e/orange-wine-festival-test` | `tenant`   | `ready-marketing`  | `/t/ready-marketing/e/orange-wine-festival-test`      |
| `unknownslug.getstampd.com.au/`                          | `tenant`         | `unknownslug`      | `/t/unknownslug`                                      |
| `events.getstampd.com.au/`                               | `reserved`       | `events`           | `null` (no rewrite — root route renders)              |
| `getstampd.com.au/`                                      | `root`           | `null`             | `null`                                                |
| `app.getstampd.com.au/`                                  | `app`            | `null`             | `/admin`                                              |

Also confirm in the diagnostic / on `/debug/worker-health`:
- `runtime: "cloudflare-worker"` on every tenant host (proves the Worker
  is serving, not Lovable / origin fallback).
- `host` header echoed matches the address bar (proves Cloudflare is
  forwarding the original Host, not rewriting).
- `hasSupabaseUrl: true` and `hasSupabaseKey: true` (proves the build-time
  env vars baked in; if false on tenant hosts only, something is
  intercepting before the Worker).

Red flags:
- `classification: "other"` on a tenant host → `matchRootDomain` is not
  recognising the host. Check the root-domain list in `src/lib/domains.ts`.
- `classification: "tenant"` on `events.getstampd.com.au` → the reserved
  list lost `events`. Fix `src/lib/reserved-subdomains.ts` before going
  further.
- Worker health returns 200 but `host` differs from the URL bar →
  Cloudflare cache rule or Transform Rule is rewriting Host; review zone
  rules.

---

## Constraints honoured

- No SQL applied, no migrations run, no `NOT VALID` constraint validated.
- No Lovable custom-domain records removed or detached.
- No change to Phase A DNS or Worker routes.
- `workers_dev` remains `true` so the `*.workers.dev` URL stays available
  as an out-of-band test surface.
