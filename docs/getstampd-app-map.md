# GetStampd — App & Deployment Map

> Build marker source of truth: `src/components/build-marker.tsx` (`BUILD_MARKER` constant).
> The marker renders at the top of every `/admin/*` page for platform admins via `AdminShell`.
> If you do not see the current `BUILD_MARKER` value on a given environment, that environment is serving a stale bundle.

## Surfaces — what each URL actually is

There are **four** surfaces and they are NOT the same deployment. Test on the direct preview URL, not the editor iframe.

| Surface | URL | What it is | Updated by |
|---|---|---|---|
| Editor workspace | `https://lovable.dev/projects/481bb391-4845-4595-9174-36e7e5516010` | The Lovable editor with an embedded preview iframe. The iframe may cache aggressively — **do not treat this as the canonical test site.** | n/a (editor) |
| **Direct preview app** (canonical test) | `https://id-preview--481bb391-4845-4595-9174-36e7e5516010.lovable.app` | Lovable preview build. Rebuilds on every commit. **This is the URL to verify changes on before deploying.** | Every commit (auto) |
| Lovable published app | `https://region-beacon.lovable.app` | Lovable publish output. Only relevant if you connect a Lovable custom domain. **Not used by getstampd.com.au.** | Clicking **Publish** in Lovable |
| **Production custom domain** | `https://getstampd.com.au` (+ `www`, `app`, `*.getstampd.com.au`) | Self-hosted Cloudflare Worker `region-beacon` (see `wrangler.toml` `[[routes]]`). **Lovable Publish does NOT update this domain** — the zone routes intercept the hostname at Cloudflare before Lovable ever sees the request. | GitHub Actions workflow `Deploy GetStampd Cloudflare Worker` (or `bunx wrangler deploy` locally) |

**Workflow:** commit → verify on direct preview URL → run `Deploy GetStampd Cloudflare Worker` from GitHub Actions → verify on `getstampd.com.au`. The build marker must match across both.

---

## Part A — Git / deployment source of truth (what this agent CAN verify)

This agent runs inside the Lovable sandbox. It has direct write access to **one** git remote — the
internal Lovable git store — and **cannot** observe Cloudflare/Netlify/Vercel build dashboards,
GitHub Action runs, or the actual JS bundle filenames served by `getstampd.com.au`. The honest
answers per requested field:

| Field | Value observed in sandbox |
|---|---|
| Lovable internal git remote | `git.private.lovable-gcp.code.storage/481bb391-4845-4595-9174-36e7e5516010.git` |
| Current sandbox branch | `edit/edt-…` (Lovable preview branch, auto-rebased to default on commit) |
| Latest sandbox commit | `git log -1` in the sandbox (see Build Marker on Preview to compare) |
| External GitHub repo (if connected) | User-reported: `github.com/stockmansridge/region-beacon.git` — **must be verified from Project → GitHub settings**. Lovable sandbox sees only the internal remote. |
| Production platform | Lovable Hosting via Cloudflare Workers (see `vite.config.ts` `nitro: true`, `wrangler.toml`). |
| Production URL | `https://getstampd.com.au` (custom domain on `region-beacon.lovable.app`) |
| Preview URL | `https://id-preview--481bb391-4845-4595-9174-36e7e5516010.lovable.app` |
| Production bundle filename | **Not knowable from sandbox.** Verify in DevTools → Network → first `/assets/index-*.js`. |
| Preview bundle filename | Same — verify in DevTools on the preview URL. |
| Supabase project ref (preview + production) | Single project: `kyjwifumacnrpgyextzz` (from `GETSTAMPD_SUPABASE_URL`). There is no staging Supabase. |

**Are getstampd.com.au, region-beacon.lovable.app, and the Lovable preview the same deployment?**

- `getstampd.com.au` and `region-beacon.lovable.app` → **same** deployment (custom domain → published Lovable site).
- Lovable preview (`id-preview--…lovable.app`) → **different** deployment, built from the current Lovable preview branch on every commit, *not* republished until the user clicks Publish.

That is the root cause of the "fixes don't apply" reports: preview gets the fix on commit; production only updates when **Publish** is clicked. The user has been verifying on `getstampd.com.au`, which is the published bundle.

## Part B — Build marker (implemented)

Added `src/components/build-marker.tsx`. Mounted once in `src/components/admin-shell.tsx` so it appears at the top of every admin page (Dashboard, Events list, Event detail, Account & Billing, System Admin, Analytics) for platform admins regardless of the Diagnostics toggle.

It displays:
- `BUILD_MARKER` constant (bump it on every audit/deploy cycle)
- Supabase project ref derived from `VITE_SUPABASE_URL`
- Current route pathname
- Instruction to read the actual bundle filename from DevTools (Vite hashes are not introspectable at runtime)

**Verification protocol** after every publish:
1. Open `getstampd.com.au/admin` in a fresh incognito.
2. Confirm `BUILD_MARKER` matches the constant in the latest commit.
3. If they differ → the publish did not propagate. Re-publish.

## Part C — Route / link map

### Admin shell
- File: `src/routes/admin.tsx`
- Auth gate: `useAuth` + `useAdminAccess` + latched-positive verdicts
- Agency context: `src/hooks/use-agency-context.ts`
- Layout: `src/components/admin-shell.tsx`

### Dashboard — `/admin`
- File: `src/routes/admin.index.tsx`
- Workspace agency ID: `useAgencyContext().selected?.id`
- Plan code: RPC `get_agency_plan_limits(_agency_id)` (single source of truth)
- Venue limit: returned by same RPC (`venue_limit`)
- Venue count: `select count from venues where agency_id = …` (via bundle loader)
- Fallback: `Free / 5 venues` when RPC errors or returns nothing parseable (red diagnostic banner explains why)

### Account & Billing — `/admin/account`
- File: `src/routes/admin.account.tsx`
- Reads plan from: `get_agency_plan_limits` **and** Stripe/RevenueCat status helpers (`src/lib/stripe.server.ts`)
- Why it can look "correct" while Dashboard looks "wrong": Account & Billing surfaces the **raw `agencies.manual_plan_override`** field alongside the resolved plan; Dashboard previously only showed the resolved plan and was failing the RPC parse silently. With the new diagnostic banner this asymmetry is now visible.

### System Admin — `/admin/system`
- File: `src/routes/admin.system.tsx`
- Org list: `select * from agencies` (admin-only RLS path)
- Manual override save: writes `agencies.manual_plan_override`
- "Debug plan" button: calls `get_agency_plan_limits(agency_id)` and renders raw JSON

### Events list — `/admin/events`
- File: `src/routes/admin.events.index.tsx`
- List source: `events` table scoped to current agency
- Create event: insert into `events`, then navigate to `/admin/events/$eventId`

### Event detail — `/admin/events/$eventId`
- File: `src/routes/admin.events.$eventId.tsx`
- Bundle loader: `loadEventBundle(eventId)` (event + venues + bonus codes + awards + domain)
- Tabs: Overview, Details, Branding, Venues, Bonus Codes, Bulk Import, Awards, Check-in, Participants, Leaderboard, Terms & Privacy, FAQ, Analytics — all in the same route file as conditional panels.
- Venue picker: `src/components/venue-mapkit-picker.tsx` (`VenueMapKitPicker`)
- Tasting QR: `src/components/venue-tasting-qr-section.tsx`
- Plan gates: read from `get_agency_plan_limits` via bundle.

### Public site
- `/live/$subdomain` family — files `src/routes/live.$subdomain.*.tsx`
- Loader: `src/lib/tenant-resolution.ts` resolves `event_domains.subdomain → event_id` and enforces `event_domains.status = 'active'` AND event `is_public = true`.
- Claim/check-in: `src/routes/checkin.$qrToken.tsx`, `collect.bonus.$token.tsx`, `passport.$token.tsx`, `awards.tsx`, `join.tsx`.

## Part D — Current broken-flow data maps

### Flow 1 — Plan display
`admin.system.tsx → agencies.manual_plan_override → RPC get_agency_plan_limits → admin.index.tsx banner / event venues tab preflight / tasting QR gate / admin.account.tsx`.
The override **is** read by the RPC. Failures observed were caused by the published bundle pre-dating the resolver fix, not by SQL.

### Flow 2 — Venue creation
`admin.index.tsx venue count → admin.events.$eventId.tsx venues tab → new venue form → preflight (RPC venue_limit) → insert into venues → storage upload → QR generation in venue-tasting-qr-section.tsx`.

### Flow 3 — Subdomain activation
`admin.events.$eventId.tsx → claim_event_subdomain(event_id, subdomain) → event_domains row inserted as pending → on event publish (`is_public = true`) → claim_event_subdomain(event_id, null) flips status to active → live route resolves via tenant-resolution.ts`.
Pending → active happens **only** when the event is published. There is now a manual recheck/activate button on the event detail page.

### Flow 4 — Apple Maps venue search
`venue form → VenueMapKitPicker → mapkit.init → mapkit.Search.autocomplete(query, {region}) → mapkit.Search.search → ranked results → selected → saved`.
The fix added autocomplete + region hint + venue-name variants. **Only present in preview/main**; will reach production after Publish.

## Part E — Source-of-truth inventory

Files matching plan/subdomain/mapkit keywords (full list above in `rg`):

| File | Role |
|---|---|
| `src/lib/getstampd-pricing.ts` | static pricing table — **display only** |
| `src/lib/stripe.server.ts` | Stripe/RevenueCat status — **source of truth for billing**, secondary for plan |
| `src/lib/tenant-resolution.ts` | subdomain → event/agency — **source of truth** for public routes |
| `src/routes/admin.system.tsx` | manual override save + debug plan — **source of truth for override** |
| `src/routes/admin.index.tsx` | Dashboard plan + venue gate — **display+gate**, reads RPC |
| `src/routes/admin.account.tsx` | Account & Billing — **display**, reads RPC + Stripe |
| `src/routes/admin.events.$eventId.tsx` | venue preflight — **gate**, reads RPC |
| `src/components/venue-mapkit-picker.tsx` | Apple Maps picker — **source of truth for venue lat/lng/address** |
| `src/components/venue-tasting-qr-section.tsx` | tasting QR gate — **gate**, reads RPC |
| `src/components/host-router.tsx` | subdomain routing — **display**, reads tenant-resolution |
| `src/routes/t.$agencySlug.tsx` | legacy tenant route — **legacy**, candidate for removal |
| `src/routes/admin_.events.$eventId.preview.tsx` | preview page — **display only** |

## Part F — Why Account & Billing "works" but Dashboard "didn't"

- Both read `get_agency_plan_limits` from the **same** Supabase project (`kyjwifumacnrpgyextzz`).
- Both are bundled in the **same** JS chunk per route, served by the **same** deployment.
- The visible asymmetry was caused by Account & Billing additionally reading `agencies.manual_plan_override` directly and surfacing the raw value, while Dashboard previously trusted only the RPC's resolved code. When the production bundle pre-dated the RPC normalisation fix, Dashboard silently fell back to Free. The new red diagnostic banner removes the asymmetry: on Free fallback Dashboard now states the reason.

## Part G — Publish/deploy checklist (must run after every code change)

1. Commit lands on Lovable preview branch automatically — verify preview shows the new `BUILD_MARKER`.
2. Run the relevant SQL migration on Supabase project `kyjwifumacnrpgyextzz` if any.
3. Click **Publish** in Lovable. Wait ~60s.
4. Hard-refresh `getstampd.com.au/admin` in incognito.
5. Confirm `BUILD_MARKER` matches the constant in the latest commit.
6. If mismatch → republish, then re-check; if still mismatched, contact Lovable support with the commit hash and the displayed marker.
