# Phase C2 — Separate Lovable preview/dev from production Supabase

**Status: PLAN ONLY.** No SQL applied, no production Cloudflare change, no
Worker rename, no DNS change, no removal of `/debug/worker-health` or
`?diag=1`. Phase C2 starts when this plan is approved.

## Why

Today both the Cloudflare production build and the Lovable preview/dev
build read the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
pair, so every write performed while iterating in Lovable preview lands
in the live database. RLS protects the worst cases, but
`platform_admin` sessions in preview can mutate production data. Phase
C2 splits the two so preview/dev points at an isolated staging
Supabase project.

---

## 0. Pre-step — confirm the production Supabase region

Before creating `getstampd-staging`, look up the production Supabase
project in the Supabase dashboard (Project Settings → General) and
record its region (e.g. `ap-southeast-2 (Sydney)`). The staging project
**must** be created in the same region so latency, RLS timing, and any
region-pinned extensions behave identically. Write the confirmed region
into this doc before moving to section 1; if it cannot be confirmed,
stop and ask — do not guess.

---

## 1. New Supabase staging project requirements

Create a brand-new Supabase project (do **not** clone, do **not** branch
from production). Required setup:

| Item                       | Value / requirement                                   |
| -------------------------- | ----------------------------------------------------- |
| Project name               | `getstampd-staging`                                   |
| Region                     | Same region as production (latency parity)            |
| Plan tier                  | Free tier is enough for synthetic data                |
| Auth providers             | Email/password + Google (mirror production setup)     |
| Email templates            | Default Supabase templates; no production branding    |
| Storage buckets            | `event-assets`, `venue-assets` (same names as prod)   |
| Allowed redirect URLs      | `https://*.lovable.app`, `http://localhost:*`         |
| Site URL                   | Lovable preview URL                                   |
| Service role key           | Keep in Lovable secrets only, never in client bundle  |
| DB password                | Stored in 1Password / team secret store               |

No production data, no production users, no production storage objects
are copied. Staging is built up from synthetic seeds (section 5).

---

## 2. Draft migrations to replay into staging

Replay the existing `supabase/migrations-draft-*` bundles in this order.
Each was previously applied to production by hand; replaying them
against staging recreates the same schema. **No new SQL is authored** —
we run the existing draft files verbatim.

1. `migrations-draft/STAGING_BOOTSTRAP.sql`
2. `migrations-draft/STAGING_BOOTSTRAP_BILLING.sql`
3. `migrations-draft/STAGING_APPLY_BUNDLE.sql`
4. `migrations-draft-domain-rename/` (01 → 03)
5. `migrations-draft-tenant-routing/` (01 → 04, then `PRODUCTION_BUNDLE.sql`)
6. `migrations-draft-publishing-gate/` (01 → 02)
7. `migrations-draft-event-announcements/` (01 → 03)
8. `migrations-draft-event-local-legal-pages/` (01 → 03)
9. `migrations-draft-event-assets-storage/` (01 → 02)
10. `migrations-draft-venue-public-pages/01`
11. `migrations-draft-venue-public-pages-storage/` (01 → 02)
12. `migrations-draft-venue-public-pages-storage-hardening/` (01 → 02)
13. `migrations-draft-venue-labels/` (01 → 02)
14. `migrations-draft-venue-labels-public-rpc/` (01 → 02)
15. `migrations-draft-venue-offer-summary/01`
16. `migrations-draft-public-leaderboard/` (01 → 02)
17. `migrations-draft-passport-stamps/01`
18. `migrations-draft-passport-rewards/01`
19. `migrations-draft-rewards-prize-draw/` (01 → 06) — **this also fixes
    the `venue_qr_codes.entry_value` gap that bit production**
20. `migrations-draft-visitor-registration/` (01 → 02)
21. `migrations-draft-customer-signup/` (01 → 02)
22. `migrations-draft-billing/` (01 → 06)
23. `migrations-draft-billing-admin/` (01 → 02)

After each step, run that folder's `STAGING_VERIFICATION*.sql` (or
`02_verify.sql`) and confirm it returns expected rows / `OK`.

Production schema is **not** touched. Staging is left at the same draft
revision as production so the two stay schema-equivalent.

---

## 3. Lovable preview/dev environment variable changes

Two env vars, one new flag:

| Variable                           | Preview/dev value                            | Production value (unchanged) |
| ---------------------------------- | -------------------------------------------- | ---------------------------- |
| `VITE_SUPABASE_URL`                | `https://<staging-ref>.supabase.co`          | live URL                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY`    | staging publishable key                      | live key                     |
| `VITE_IS_STAGING`                  | `"true"` (new — drives `TestEnvBanner`)      | unset / `"false"`            |

Set in Lovable Project Settings → Environment → **Preview** scope only.
The Cloudflare production build reads its values from the Cloudflare
Pages / Worker build env, which is configured separately and is **not
modified** in this phase.

Server-only equivalents (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) get the same split: staging values in
Lovable preview env, production values stay in the Cloudflare Worker
deploy env. `SUPABASE_SERVICE_ROLE_KEY` for staging never leaves the
Lovable secrets vault.

---

## 4. Production Cloudflare keeps live Supabase values

The Cloudflare Worker is built and deployed from a separate pipeline.
Its build env (`VITE_SUPABASE_*`, `SUPABASE_*`) is **untouched** in
Phase C2. Verification after Phase C2 ships:

- Hit `https://getstampd.com.au/debug/worker-health` → confirm
  `hasSupabaseUrl: true` and `hasSupabaseKey: true`. Use this **only**
  to prove the production Worker received its Supabase build env vars.
  Do **not** rely on this endpoint to assert which Supabase project ref
  is in use — treat any project-ref field it happens to expose as
  incidental, not contractual.
- Verify the production Supabase project ref via the browser **Network**
  tab on `https://app.getstampd.com.au/admin` (any Supabase request URL
  will contain the prod project ref), or via an authenticated
  platform_admin-only diagnostic surface. Never publish project-ref
  verification through a public debug endpoint.
- Spot-check `https://app.getstampd.com.au/admin` → existing production
  data (agencies, events) still visible to an existing prod admin.
- Spot-check `https://ready-marketing.getstampd.com.au/` → still resolves
  via the production `agencies` / `event_domains` rows.

No `wrangler.toml`, no `[[routes]]`, no DNS, no Worker rename in this
phase.

---

## 5. Seeding staging — split into SQL data + auth user script

Seeding is done in **two passes**. `auth.admin.createUser` is a
service-role API call, not SQL, and must never appear inside a `.sql`
file.

### 5a. `scripts/staging/create-synthetic-users.ts` (auth users first)

A standalone Node/Bun script run locally by an operator with the
**staging** `SUPABASE_SERVICE_ROLE_KEY` exported in their shell. It uses
`@supabase/supabase-js` `auth.admin.createUser` to create:

- 1 synthetic `platform_admin` (`staging-admin@example.test`)
- 1 synthetic `agency_owner` per synthetic agency (both `@example.test`)
- 5 synthetic visitors per event (`@example.test`)

The script:
- Refuses to run if `SUPABASE_URL` host does not contain the staging
  project ref (hard guard against accidental prod execution).
- Generates random passwords, prints the platform_admin password once to
  stdout for the operator to paste into 1Password, and discards the rest.
- Writes the resulting `auth.users.id` values to
  `supabase/staging-seed/.generated-user-ids.json` (gitignored) for the
  SQL pass to consume, **or** prints an `INSERT … VALUES` block the
  operator pastes into `01_synthetic_data.sql` before running it.
- Is idempotent: if a user with that email already exists, it reuses the
  existing id instead of failing.

### 5b. `supabase/staging-seed/01_synthetic_data.sql` (data only)

Runs **only against staging**. Creates non-auth data and links the
already-created synthetic `auth.users` ids into membership/admin
tables. It does **not** call `auth.admin.createUser`, does **not** touch
`auth.users` directly, and does **not** insert into `auth.*` schemas.

Contents:

- 2 synthetic agencies (`acme-trails`, `demo-vino`) via `agencies` insert
  with fabricated slugs.
- Membership rows linking the synthetic platform_admin / agency_owner
  user ids (from 5a) into `user_roles`, `agency_members`, etc.
- 2 events per agency, status `draft`, with synthetic venues,
  `event_branding`, `event_domains` (using `*.staging.invalid` subdomains
  that are never resolvable in DNS).
- 5 visitor rows per event linked to the visitor `auth.users.id` values
  from 5a, with obviously fake display names (`Test Visitor 1`, etc.).

Hard rules for both passes:
- Every email address ends in `@example.test`, `@example.com`, or
  `@example.org` (reserved-by-IANA, will never deliver).
- No phone numbers, no real addresses, no real lat/lng (use the Null
  Island fallback `0,0` plus a `description: "synthetic"`).
- No copying from `pg_dump` of production. Both files are hand-written.
- Both passes are idempotent (`ON CONFLICT DO NOTHING` in SQL; "reuse
  existing user" branch in the TS script) so staging reset is safe.

---

## 6. Enable `TestEnvBanner` only in staging

`src/components/test-env-banner.tsx` already exists and is currently
unused. Wire it in `src/routes/__root.tsx` (or the admin shell) gated by
`import.meta.env.VITE_IS_STAGING`:

```tsx
import { TestEnvBanner } from "@/components/test-env-banner";

const isStaging = import.meta.env.VITE_IS_STAGING === "true";

// inside RootComponent JSX, above <Outlet />:
{isStaging ? <TestEnvBanner note="staging.getstampd preview" /> : null}
```

Rules:
- Visible on `/admin/*` and Lovable preview surfaces only. The banner
  component's docstring already excludes public event pages — keep that
  contract; do **not** render it inside `live.$subdomain.*` routes.
- Production build has `VITE_IS_STAGING` unset → banner is tree-shaken
  away by Vite's dead-code elimination of `false ? ... : null`.
- No `localStorage` toggle, no query-string override — staging-vs-prod
  is decided exclusively at build time.

---

## 7. Validation: preview/dev writes no longer touch production

Run before declaring C2 complete. Each check is independent.

1. **Project ref check.** In Lovable preview, open the browser devtools
   Network tab → any Supabase request URL should contain the **staging**
   project ref, never the production ref. Same check on
   `https://getstampd.com.au/` should show the **production** ref.
2. **Write isolation.** From Lovable preview, create a test agency
   `c2-write-test-<timestamp>` via the admin signup flow. Then run
   `select id from public.agencies where slug like 'c2-write-test-%'`
   in production Supabase SQL editor → expect **zero rows**. Run the same
   query in staging Supabase → expect 1 row.
3. **Auth isolation.** Sign up a new user in Lovable preview with
   `phase-c2-test@example.test`. Check `auth.users` in production →
   expect no match. Check staging → expect match.
4. **Storage isolation.** Upload a 1px placeholder logo via preview's
   admin branding panel. Verify the object lands in the staging
   `event-assets` bucket and NOT in production storage.
5. **RPC isolation.** Call `resolve_agency_by_subdomain('acme-trails')`
   from preview → returns the synthetic staging agency. Call the same
   RPC from `https://getstampd.com.au/` → returns the real production
   row (or null).
6. **Build banner check.** Lovable preview shows the amber `TestEnvBanner`
   strip at the top of `/admin`. `https://app.getstampd.com.au/admin/` does
   **not** show it.
7. **`/debug/worker-health` env-presence check.** Both environments
   return `hasSupabaseUrl: true` and `hasSupabaseKey: true`. Use this
   check only to confirm the Worker received Supabase env vars — not to
   assert which project ref is in use (see section 4 for the
   Network-tab / admin-only project-ref check).

A single failed check blocks the rollout; do not "fix forward" by
patching env vars in production.

---

## 8. Rollback plan

If staging wiring fails (auth broken, schema mismatch, seed errors,
banner showing on production, anything else), roll back in this order.
Each step is reversible without code revert or DNS change.

**L1 — Revert preview env vars (fastest):**
- In Lovable Project Settings → Environment → Preview, restore the
  production `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` values; unset `VITE_IS_STAGING`.
- Next preview build immediately reconnects to production. Banner
  disappears. No code change required.

**L2 — Disable the banner wiring:**
- Comment out the `<TestEnvBanner />` line in `__root.tsx` and push.
- Use only if the gating logic itself misfires; L1 should already
  remove the banner via env-var.

**L3 — Delete the staging Supabase project:**
- Only after L1 is in place. Project deletion is irreversible (~7-day
  recovery window in Supabase). Confirm no team member is mid-test
  before deleting.

**L4 — Revert the staging seed file:**
- `git rm supabase/staging-seed/01_synthetic.sql` and push. The file is
  never executed against production, so this is cosmetic — included for
  completeness.

Production Cloudflare, production Supabase, production DNS, the Worker
name, `/debug/worker-health`, and `?diag=1` remain unchanged through
every rollback level.

---

## Constraints honoured

- No production SQL applied.
- No production DNS change.
- No Cloudflare route change.
- No Worker rename.
- No real visitor PII copied to staging (all seeds use `@example.*`).
- `/debug/worker-health` left in place.
- `?diag=1` host-diagnostic bypass left in place.
