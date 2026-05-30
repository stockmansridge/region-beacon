# Phase A Cloudflare Cutover — apex + www + app

Scope: move `getstampd.com.au`, `www.getstampd.com.au`, and
`app.getstampd.com.au` from the current Lovable custom-domain binding to
the `getstampd-prod` Cloudflare Worker.

**Out of scope for Phase A:** wildcard `*.getstampd.com.au`, any DNS change
for tenant subdomains, any SQL change. Do not add wildcard records yet.

Prerequisite: the workers.dev test deploy (`https://getstampd-prod.<acct>.workers.dev`)
is green per `DEPLOY_STEPS.md` §4.4.

---

## 1. Exact Cloudflare DNS records

Cloudflare Dashboard → `getstampd.com.au` zone → **DNS → Records**.

Add these three records. All must be **Proxied (orange cloud)** — a
DNS-only / grey-cloud record will bypass the Worker and route fail.

| Type  | Name  | Target / Content      | Proxy   | TTL  | Purpose                                        |
| ----- | ----- | --------------------- | ------- | ---- | ---------------------------------------------- |
| A     | `@`   | `192.0.2.1`           | Proxied | Auto | Apex placeholder IP; routing is by Worker route, not by IP. RFC 5737 TEST-NET-1 — never reachable, intentional. |
| CNAME | `www` | `getstampd.com.au`    | Proxied | Auto | Mirror of apex.                                |
| CNAME | `app` | `getstampd.com.au`    | Proxied | Auto | Admin host. Worker rewrites `/` → `/admin`.    |

Notes:
- The apex `A` value does **not** matter for delivery because the Worker
  route intercepts every request before origin selection. `192.0.2.1` is
  used purely to satisfy Cloudflare's "apex must be A/AAAA/CNAME flattening"
  requirement while keeping the record proxied.
- Do **not** add `AAAA`, `MX`, or `TXT` records as part of this cutover.
- Do **not** add a wildcard `*` record in Phase A.

SSL/TLS:
- **SSL/TLS → Overview:** mode = **Full (strict)**.
- **SSL/TLS → Edge Certificates:** Universal SSL **Active**, covering
  `getstampd.com.au` and `*.getstampd.com.au`. No order required.
- **Always Use HTTPS:** On.

---

## 2. What to do with the existing Lovable A records

Today apex / www / app resolve to the Lovable custom-domain target. Handle
them as follows in the Cloudflare DNS table:

| Existing record                | Action in Phase A | Why |
| ------------------------------ | ----------------- | --- |
| Apex `A @ → <Lovable IP>`      | **Replace** with the new `A @ → 192.0.2.1` (proxied) above. There can be only one apex A record at a time. | Cloudflare will not accept two A records on `@` with conflicting proxy state. The Worker route takes over delivery. |
| `CNAME www → <Lovable host>`   | **Replace** with `CNAME www → getstampd.com.au` (proxied). | Same reason — one CNAME per name. |
| `CNAME app → <Lovable host>`   | **Replace** with `CNAME app → getstampd.com.au` (proxied). | Same reason. |
| Any other Lovable-related record (verification TXTs, etc.) | **Leave in place.** | They are inert once the host is no longer pointing at Lovable, and removing them prevents a clean rollback. |

Rollback inventory (do this **before** editing):
1. Open each of the three records in the Dashboard.
2. Screenshot or copy the existing **Content** value (the Lovable IP for
   apex; the Lovable hostname for www/app).
3. Paste those values into the rollback section of your cutover ticket so
   §5 can be executed without guessing.

The Lovable custom-domain binding itself (in the Lovable project settings)
should be **left attached** during Phase A. Detaching it deletes the
verification state and makes rollback slower. It can be detached later
once Cloudflare has been stable for at least 7 days.

---

## 3. Exact Worker route settings

Cloudflare Dashboard → Workers & Pages → **getstampd-prod** →
**Settings → Triggers → Routes → Add route**.

Add three routes, one at a time. All bind to zone `getstampd.com.au`. The
trailing `/*` is required — without it only the bare hostname matches.

| Pattern                          | Zone               | Failure mode |
| -------------------------------- | ------------------ | ------------ |
| `getstampd.com.au/*`             | `getstampd.com.au` | Hits Cloudflare's "no Worker" 522/1016 |
| `www.getstampd.com.au/*`         | `getstampd.com.au` | Same |
| `app.getstampd.com.au/*`         | `getstampd.com.au` | Same |

Do **not**:
- Use **Custom Domains** for any of these in Phase A. Custom Domains
  conflict with the routes above and force Cloudflare to manage DNS in a
  way that breaks rollback.
- Add a `*.getstampd.com.au/*` route. That is Phase B.
- Toggle `workers_dev` off. Keep the workers.dev URL live so the smoke
  endpoint stays reachable independent of zone state.

Repo-side change paired with this step: uncomment the three Phase A
`[[routes]]` blocks in `wrangler.toml` and push. Cloudflare's GitHub
integration redeploys; the routes in `dist/server/wrangler.json` then match
what you added in the Dashboard. The Dashboard routes and the file-based
routes must agree — if they drift, the Dashboard wins at request time but
the next deploy will rewrite them from the file.

---

## 4. Expected result per domain

After DNS propagates (typically <5 min on Cloudflare-authoritative zones)
and the routes are attached:

| URL                                            | Expected                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `https://getstampd.com.au/`                    | Marketing / coming-soon page, SSR-rendered by the Worker. Valid cert.    |
| `https://www.getstampd.com.au/`                | Same content as apex (HostRouter classifies as `root`).                  |
| `https://app.getstampd.com.au/`                | Rewritten to `/admin` → admin login screen.                              |
| `https://app.getstampd.com.au/admin/events`    | Deep link SSRs directly (no blank shell) for authenticated platform admin. |
| `https://app.getstampd.com.au/checkin/<token>` | QR check-in flow renders on mobile (route is never rewritten by host).   |
| `https://getstampd-prod.<acct>.workers.dev/`   | Still works — used as an out-of-band health check.                       |
| `https://anything.getstampd.com.au/`           | **Expected to fail** in Phase A (no wildcard DNS, no wildcard route).    |

Verification signals:
- Response header `cf-ray:` present on all three hosts (proves Cloudflare
  proxy is in the path).
- Worker **Observability → Live tail** shows requests for the three hosts.
- No 522 / 1016 / 525 errors in the Worker logs.

---

## 5. Rollback — return apex/www/app to Lovable

Rollback is Dashboard-only. No SQL, no code revert required.

**L1 — Detach Worker routes (fastest, ~30s):**
1. Workers & Pages → `getstampd-prod` → **Triggers → Routes**.
2. Delete `getstampd.com.au/*`, `www.getstampd.com.au/*`,
   `app.getstampd.com.au/*`.
3. The three hosts now bypass the Worker. Because the apex `A` record
   still points at `192.0.2.1`, requests will return a Cloudflare error
   page until L2 completes — proceed straight to L2.

**L2 — Restore Lovable DNS values:**
1. `getstampd.com.au` zone → **DNS → Records**.
2. Edit `A @` → set Content back to the Lovable IP captured in §2.
   Keep Proxy = **Proxied** (Lovable accepts proxied traffic).
3. Edit `CNAME www` → set Target back to the Lovable hostname captured
   in §2. Proxy = Proxied.
4. Edit `CNAME app` → set Target back to the Lovable hostname captured
   in §2. Proxy = Proxied.
5. Wait for propagation (typically 1–5 min on Cloudflare-authoritative
   zones; up to TTL otherwise).

**L3 — Optional: also revert the repo `wrangler.toml`:**
1. Re-comment the three Phase A `[[routes]]` blocks and push. This keeps
   the deployed `dist/server/wrangler.json` from re-asserting routes on
   the next build. Not required for rollback to take effect — L1 + L2
   already restore traffic to Lovable.

**L4 — Nuclear (only if Cloudflare itself is the problem):**
1. Crazy Domains registrar → change nameservers back to the pre-Cloudflare
   nameservers. Propagation: up to 24h. Do not do this unless L1–L3 have
   been tried and the issue is confirmed to be at the Cloudflare edge.

Post-rollback verification:
- `https://getstampd.com.au/` → Lovable-served marketing page.
- `https://app.getstampd.com.au/` → Lovable admin.
- Worker logs go quiet for these three hosts (workers.dev URL still works).

---

## Sign-off checklist

- [ ] §2 rollback inventory captured (old apex IP + www/app CNAME targets)
- [ ] `wrangler.toml` Phase A routes uncommented and deployed via GitHub
- [ ] Three DNS records added, all proxied
- [ ] Three Worker routes attached in Dashboard
- [ ] §4 smoke matrix all green
- [ ] No wildcard DNS or wildcard route added (Phase B is separate)
- [ ] No SQL applied
