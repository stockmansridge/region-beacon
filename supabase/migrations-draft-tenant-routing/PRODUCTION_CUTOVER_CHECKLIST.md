# Tenant Routing — Production Cutover Checklist

**Status:** DRAFT. Do NOT execute any step here against production without
explicit user approval per step. Staging is complete and green
(01 + 02 patched + 03 applied; 04 verify 1–6 all pass against
`ready-marketing` / `orange-wine-festival-test` / `evt-metaecph3f`).

Scope guardrails (do NOT cross):
- No changes to production RLS.
- No changes to `event_domains` (legacy `/live/{subdomain}` keeps working).
- No `VALIDATE CONSTRAINT` on `agencies_slug_public_subdomain_check` in this
  cutover. That is a separate, later step once we are sure every existing row
  passes — `NOT VALID` only protects new INSERT/UPDATE traffic.
- No destructive data changes.

---

## 1. Confirm the final patched migration files

Files in `supabase/migrations-draft-tenant-routing/`:

- [ ] `01_resolve_agency_by_subdomain.sql`
- [ ] `02_get_public_event_by_agency_and_slug.sql` — **MUST be the patched
      version with `evt_slug` local variable** (not the original which had a
      `slug` variable that collided with `agencies.slug` and produced
      `42702 column reference "slug" is ambiguous`). Confirm the file
      contains the line:
      `evt_slug text := lower(trim(coalesce(_event_slug, '')));`
      and the WHERE clause uses `e.public_slug = evt_slug::citext`.
- [ ] `03_agencies_slug_check.sql` — citext-cast predicate, `NOT VALID`.
- [ ] `04_verify.sql` — read-only, 6 checks.

Production must apply these exact files. Do not re-edit before apply; if a
change is needed, update the file in staging-equivalent form, re-test there
first, then bring it across.

---

## 2. Production preflight checks (read-only, run in prod SQL editor)

Run each block and capture output. Do NOT proceed if any fails.

**2a. Agency slug audit** (gate for whether 03 is safe to apply):
```sql
select id, slug
from public.agencies
where slug::text !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
   or lower(slug::text) in (
     'app','admin','api','www','events','support','billing',
     'login','signup','dashboard','system','assets','static',
     'cdn','demo','mail'
   );
```
- Expect: 0 rows. If rows exist, **do not apply 03** — report the rows and
  pick safe replacement slugs first.

**2b. Existing function signature check** (make sure we are not stomping on a
different function with the same name):
```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid)             as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'resolve_agency_by_subdomain',
    'get_public_event_by_agency_and_slug',
    'get_public_event_by_domain',
    'resolve_event_by_host',
    'event_is_publishable'
  )
order by p.proname;
```
- Expect: `get_public_event_by_domain`, `resolve_event_by_host`,
  `event_is_publishable` already exist. The two new ones either do not exist
  yet, or — if a previous draft was applied — match the signatures in
  `04_verify.sql` checks 1 and 2.

**2c. `events` schema check** (the patched 02 depends on these columns):
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('status','deleted_at','public_slug','agency_id',
                      'current_terms_version_id');
```
- Expect: all 5 present. `public_slug` is `citext`. NO `is_published`
  column should be referenced anywhere.

**2d. `event_domains` schema check** (sanity — must NOT be touched, just
confirm the columns we already rely on still exist):
```sql
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='event_domains'
order by ordinal_position;
```
- Expect: `public_subdomain`, `custom_domain`, `domain_type`, `status` all
  present. No `hostname` column. Nothing in the cutover writes to this table.

**2e. Sample agency + event resolve via existing public RPC** (confirms the
publishable filter is meaningful in prod data):
```sql
-- pick a real production agency slug + a published event with public_slug
select id, name, slug from public.agencies
where deleted_at is null
order by created_at desc limit 5;

-- then for the chosen agency_id:
select id, name, public_slug, status, deleted_at,
       public.event_is_publishable(id) as publishable
from public.events
where agency_id = '<paste-agency-uuid>'
order by created_at desc limit 10;
```
- Expect: at least one row with `status='published'`, `deleted_at IS NULL`,
  `publishable=true`. Record `<agency_slug>` and `<event_public_slug>` for
  step 3 verify check 6.

---

## 3. Production apply order

Run in the SQL editor, one block at a time. After each, paste output.

1. [ ] Apply `01_resolve_agency_by_subdomain.sql`.
       Confirm via `04_verify.sql` check 1 (signature row appears).
2. [ ] Apply `02_get_public_event_by_agency_and_slug.sql`
       **(patched version — see §1)**.
       Confirm via `04_verify.sql` check 2 (17-column TABLE signature).
3. [ ] **Only if §2a returned 0 rows**, apply `03_agencies_slug_check.sql`.
       Confirm via `04_verify.sql` check 3
       (`agencies_slug_public_subdomain_check` exists, `convalidated=false`).
       If §2a had rows, skip this step entirely and open a follow-up.
4. [ ] Run `04_verify.sql` checks 4–6 against the real prod slugs captured
       in §2e. All three must return exactly the expected row counts (0 for
       reserved, 1 for the real agency, 1 for the real agency+event pair).

If any check fails, STOP. Do not proceed to DNS/deploy.

---

## 4. Deployment / DNS steps

App code is already in `main` (HostRouter, `/t/$agencySlug`,
`/t/$agencySlug/e/$eventSlug`, tenant-resolution helpers, diagnostic panel).
A normal publish picks it up — no separate code release is required other
than the standard publish flow.

DNS / hosting:

1. [ ] **Confirm wildcard hosting support.** The Lovable custom-domain
       binding for `getstampd.com` must accept arbitrary
       `*.getstampd.com` subdomains and serve them through the same app
       bundle. If wildcard is not supported on the current plan/binding,
       stop here — the routing code cannot resolve a host that never reaches
       the app.
2. [ ] **Configure wildcard DNS.** Add a `CNAME *.getstampd.com` (or
       equivalent A/ALIAS) pointing to the Lovable target host already used
       by the apex. Keep TTL low (300s) for the cutover window.
3. [ ] **Confirm SSL for wildcard subdomains.** Hit
       `https://anything.getstampd.com/` from a fresh browser session and
       verify the cert is valid (wildcard or per-host issuance — either is
       fine, but it must be valid, not self-signed/expired).
4. [ ] **Test real browser URLs** — see §5.

Out of scope for this cutover: changing the `.com.au` domain, removing or
renaming `event_domains` rows, touching `/live/*` routes.

---

## 5. Smoke tests (run after DNS + SSL are live)

For each row: open the URL in a clean browser, append `?diag=1` to read the
Host Diagnostic panel (or sign in as a `platform_admin` to see it without
the query string). Record `classification`, `rewriteTo`, `resolutionSource`,
`resolvedAgencyId`, `resolvedEventId`.

| # | URL | Expected `classification` | Expected `rewriteTo` | Expected `resolutionSource` | Expected behavior |
|---|---|---|---|---|---|
| 1 | `https://getstampd.com/` | `root` | — | `root` | Marketing site renders |
| 2 | `https://www.getstampd.com/` | `root` | — | `root` | Marketing site renders (or 301 to apex if that is current behavior) |
| 3 | `https://app.getstampd.com/` | `app` | `/admin` | `app` | Admin login screen |
| 4 | `https://events.getstampd.com/` | `reserved` | — | `reserved` | Branded not-found / reserved page. Must NOT resolve as an agency |
| 5 | `https://ready-marketing.getstampd.com/` | `tenant` | `/t/ready-marketing` | `agency_subdomain` | Agency workspace renders; `resolvedAgencyId = 8f7770f5-892b-4583-83b5-e946ab84ddf3` |
| 6 | `https://ready-marketing.getstampd.com/e/orange-wine-festival-test` | `tenant` | `/t/ready-marketing/e/orange-wine-festival-test` | `public_event_slug` | Public event page renders; `resolvedEventId = 3ca240d9-6b42-4852-b524-1fb59b29a89a` |
| 7 | `https://unknownslug.getstampd.com/` | `tenant` | `/t/unknownslug` | `not_found` | Branded workspace-not-found page; no crash |
| 8 | `https://{legacyEventSubdomain}.getstampd.com/` and `/leaderboard` | `tenant` | `/live/{subdomain}` and `/live/{subdomain}/leaderboard` | `legacy_event_domain` | Existing `/live/*` flow renders exactly as before |

Pass criteria: every row matches the expected columns and renders without
console or network errors. Capture the diagnostic JSON for rows 5, 6, 7, 8
for the cutover record.

Replace `{legacyEventSubdomain}` with a real event subdomain known to be
seeded in `event_domains` (do NOT modify `event_domains` to make this work
— if there is no live legacy event in prod right now, mark row 8
"N/A — no legacy tenant currently active" and move on).

---

## 6. Rollback plan

No destructive data changes are made by this cutover. Rollback is a
front-door change, not a data restore.

**6a. Disable HostRouter tenant routing without reverting code**
Fastest revert. In `src/components/host-router.tsx`, force tenant
classification to fall through to legacy behavior — either:
- short-circuit the `tenant` branch so `{slug}.getstampd.com` rewrites to
  `/live/{slug}` (legacy path) instead of `/t/{slug}`, or
- treat every non-app, non-reserved subdomain as `other` and render the
  marketing fallback.
Ship as a one-line change behind a constant (e.g. `TENANT_ROUTING_ENABLED =
false`) and publish. This restores pre-cutover behavior in under a minute.

**6b. Revert app deploy entirely**
If 6a is not enough, roll the Lovable published deployment back to the last
known-good version from before the cutover via the publish history UI. This
unships HostRouter changes, the `/t/*` routes, and the diagnostic panel
additions in one shot. DNS does not need to change.

**6c. SQL functions can remain safely in place**
`resolve_agency_by_subdomain` and `get_public_event_by_agency_and_slug` are
`SECURITY DEFINER STABLE` with narrow public-safe projections and no
side-effects. If the front-end is reverted, nothing calls them and they
sit idle. Leave them deployed — do not drop on rollback. If a clean drop
is later required:
```sql
drop function if exists public.get_public_event_by_agency_and_slug(text, text);
drop function if exists public.resolve_agency_by_subdomain(text);
```

**6d. `agencies_slug_public_subdomain_check`**
`NOT VALID`, so it only blocks new bad INSERT/UPDATE traffic. It cannot
break existing rows or existing reads. Safe to leave on rollback. If a
drop is needed:
```sql
alter table public.agencies drop constraint agencies_slug_public_subdomain_check;
```

**6e. DNS**
Wildcard DNS is additive. Leaving `*.getstampd.com` pointing at the app
after a code rollback is harmless — unmatched hosts fall through to the
marketing/not-found path. Do not rip DNS out as part of a code rollback.

**6f. No destructive changes**
This cutover writes nothing to user data. `event_domains`, `agencies`,
`events`, RLS, storage, and `/live/*` are all untouched.

---

## Sign-off

- [ ] §1 file inventory confirmed (especially patched 02)
- [ ] §2 preflight: all five blocks captured, audit returned 0 rows (or 03 skipped)
- [ ] §3 apply: 01, 02, (03), 04 — all verify checks green against real prod slugs
- [ ] §4 DNS + SSL live for wildcard
- [ ] §5 smoke tests captured (8 rows, diagnostic JSON for tenant rows)
- [ ] §6 rollback plan acknowledged

Once all boxes are ticked, the cutover is complete. The `VALIDATE
CONSTRAINT` step is a separate, later change and is explicitly out of scope
here.
