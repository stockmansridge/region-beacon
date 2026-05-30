# Tenant Routing — Production Readiness

Companion to `PRODUCTION_BUNDLE.sql` and `PRODUCTION_CUTOVER_CHECKLIST.md`.
**Nothing in this doc has been applied to production.** DNS unchanged.
`NOT VALID` constraint left unvalidated. `event_domains` and `/live/*`
untouched.

---

## 1. Diff between staging-tested SQL and production-ready SQL

**There is no diff.** `PRODUCTION_BUNDLE.sql` is byte-equivalent to the
patched staging files (block headers and shared safety comment added; SQL
statements are identical). Summary of what each block does relative to the
state of production today:

| Block | Object | Production state today | After apply |
|---|---|---|---|
| 01 | `public.resolve_agency_by_subdomain(text)` | does not exist | new SECURITY DEFINER STABLE RPC, narrow projection `(agency_id, name, slug)`, `EXECUTE` to `anon, authenticated` |
| 02 | `public.get_public_event_by_agency_and_slug(text, text)` | does not exist | new SECURITY DEFINER STABLE RPC, 17-column projection (mirrors `get_public_event_by_domain`), `EXECUTE` to `anon, authenticated`. **Patched** vs. the original draft: local var `slug` -> `evt_slug` to resolve PG error `42702 column reference "slug" is ambiguous` (caught by staging verify check 6) |
| 03 | constraint `agencies_slug_public_subdomain_check` on `public.agencies` | does not exist | added `NOT VALID`. Enforces lowercase + DNS-label shape + reserved-list exclusion on new INSERT/UPDATE only. Existing rows unaffected |

Out of bundle on purpose:
- No `VALIDATE CONSTRAINT` (separate later step).
- No RLS changes.
- No `event_domains` writes.
- No grants on tables. Only `GRANT EXECUTE` on the two new functions.

---

## 2. Production preflight SQL (read-only)

Run each block in the prod SQL editor. Do NOT proceed if anything is off.

### 2a. Slug audit — gates block 03
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
Expect **0 rows**. If >0, skip block 03 and report the offending rows.

### 2b. Existing function signatures (no name collisions, dependencies present)
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
Expect: `get_public_event_by_domain`, `resolve_event_by_host`, and
`event_is_publishable` present. The two new ones either absent, or — if a
prior draft was applied — match the signatures in §4 verify checks 1 & 2.

### 2c. `events` schema (block 02 depends on these columns)
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'events'
  and column_name in ('status','deleted_at','public_slug','agency_id',
                      'current_terms_version_id');
```
Expect all 5 present; `public_slug` is `citext`. No `is_published` column
referenced anywhere in the bundle.

### 2d. `event_domains` schema (sanity — must NOT be touched)
```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'event_domains'
order by ordinal_position;
```
Expect `public_subdomain`, `custom_domain`, `domain_type`, `status` to all
exist. Nothing in this cutover writes to this table.

### 2e. Capture a real prod agency + published event for verify checks 5 & 6
```sql
select id, name, slug from public.agencies
where deleted_at is null
order by created_at desc limit 5;

-- then with one chosen agency_id:
select id, name, public_slug, status, deleted_at,
       public.event_is_publishable(id) as publishable
from public.events
where agency_id = '<paste-agency-uuid>'
order by created_at desc limit 10;
```
Pick one row with `status='published'`, `deleted_at IS NULL`,
`publishable=true`. Record `<agency_slug>` and `<event_public_slug>` for §4.

---

## 3. Production apply order

Use `PRODUCTION_BUNDLE.sql`. One block at a time in the SQL editor. Paste
output back after each.

1. Run **BLOCK 01**. Confirm with verify check 1 (§4).
2. Run **BLOCK 02** (patched). Confirm with verify check 2 (§4).
3. **If §2a returned 0 rows**, run **BLOCK 03**. Confirm with verify check 3 (§4).
   If §2a had rows, skip block 03 entirely and open a follow-up.
4. Run verify checks 4–6 (§4) against the slugs captured in §2e.

If any check fails, STOP. Do not proceed to DNS or smoke tests.

---

## 4. Post-apply verify SQL

### Check 1 — `resolve_agency_by_subdomain` signature
```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid)             as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='resolve_agency_by_subdomain';
```
Expect 1 row · `args='_sub text'` · `result='TABLE(agency_id uuid, name text, slug text)'`.

### Check 2 — `get_public_event_by_agency_and_slug` signature
```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid)             as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='get_public_event_by_agency_and_slug';
```
Expect 1 row · `args='_sub text, _event_slug text'` · 17-column `TABLE(...)` result with `public_slug citext`.

### Check 3 — constraint exists, `NOT VALID`
```sql
select c.conname, pg_get_constraintdef(c.oid) as definition, c.convalidated
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname='public' and t.relname='agencies'
  and c.conname='agencies_slug_public_subdomain_check';
```
Expect 1 row · `convalidated = false` · definition contains the regex, the `lower(...)` check, and the reserved-list `NOT IN (...)`.

### Check 4 — reserved slugs return 0 rows via the RPC
```sql
select 'app'    as input, count(*) from public.resolve_agency_by_subdomain('app')
union all select 'admin' , count(*) from public.resolve_agency_by_subdomain('admin')
union all select 'www'   , count(*) from public.resolve_agency_by_subdomain('www')
union all select 'events', count(*) from public.resolve_agency_by_subdomain('events')
union all select 'api'   , count(*) from public.resolve_agency_by_subdomain('api');
```
Expect all 5 `count = 0`.

### Check 5 — real agency resolves
```sql
select * from public.resolve_agency_by_subdomain('<prod-agency-slug>');
```
Expect exactly 1 row with non-null `agency_id`, `name`, `slug`.

### Check 6 — real agency + published event resolves
```sql
select * from public.get_public_event_by_agency_and_slug('<prod-agency-slug>', '<prod-event-public-slug>');
```
Expect exactly 1 row, 17 columns. Branding fields may be NULL if no
`event_branding` row exists; `venue_label_singular='Venue'`,
`venue_label_plural='Venues'` are the fallbacks.

---

## 5. DNS / hosting checklist for wildcard SaaS routing

Do not execute yet. Order matters — do not change DNS before SQL §3 verify is green.

1. **Confirm wildcard hosting is supported** on the Lovable custom-domain
   binding for `getstampd.com`. Any host matching `*.getstampd.com` must be
   routed to the same app bundle as the apex. If the current plan/binding
   does not support wildcards, stop — the routing code never sees the host.
2. **Add wildcard DNS** `CNAME *.getstampd.com` -> the same Lovable target
   host as the apex (or A/ALIAS equivalent). Keep TTL at 300s for the
   cutover window so backout is fast.
3. **Confirm SSL** for arbitrary subdomains. From a clean browser, open
   `https://anything-here.getstampd.com/` and verify the cert is valid
   (wildcard cert or per-host issuance — either is fine; it just has to be
   trusted, not self-signed or expired). If the platform issues per-host
   certs lazily, hit the test hostnames once each to prime issuance before
   the smoke matrix.
4. **Do not touch** the `.com.au` binding, `event_domains` rows, or
   `/live/*` routes in this step.
5. **Smoke test** the 8-row matrix in
   `PRODUCTION_CUTOVER_CHECKLIST.md` §5. For each tenant URL, capture the
   Host Diagnostic panel JSON (`?diag=1` or platform_admin session):
   `hostname`, `pathname`, `classification`, `subdomain`, `rewriteTo`,
   `resolutionSource`, `resolvedAgencyId`, `resolvedEventId`.

---

## 6. Rollback plan (non-destructive)

Nothing in this cutover writes user data. Rollback is a front-door change.

**6a. Disable tenant routing without reverting code** — fastest.
Add a `TENANT_ROUTING_ENABLED` constant in `src/components/host-router.tsx`
and short-circuit the `tenant` classification to either:
- rewrite `{slug}.getstampd.com` to legacy `/live/{slug}` (preserves the
  pre-cutover behavior for any subdomain that has a legacy `event_domains`
  row), or
- classify as `other` and render the marketing fallback.
Publish. Restores prior behavior in under a minute. DNS does not need to
change.

**6b. Revert the app deploy entirely.**
Use the Lovable publish history to roll back to the last known-good build
from before the cutover. Unships HostRouter changes, `/t/*` routes, and the
diagnostic panel additions in one shot. DNS does not need to change.

**6c. SQL functions can stay deployed.**
Both RPCs are `SECURITY DEFINER STABLE` with narrow public projections and
no side-effects. With the front-end reverted, nothing calls them and they
sit idle. Leave deployed. If clean removal is later required:
```sql
drop function if exists public.get_public_event_by_agency_and_slug(text, text);
drop function if exists public.resolve_agency_by_subdomain(text);
```

**6d. `agencies_slug_public_subdomain_check` can stay deployed.**
`NOT VALID` means it only constrains new INSERT/UPDATE traffic. It cannot
break reads or existing rows. Safe to leave. If removal is later required:
```sql
alter table public.agencies drop constraint agencies_slug_public_subdomain_check;
```

**6e. DNS rollback is additive-safe.**
Leaving `*.getstampd.com` pointed at the app after a code rollback is
harmless — unmatched hosts fall through to marketing / not-found. Do not
rip wildcard DNS out as part of a code rollback.

**6f. Explicitly no destructive changes.**
This cutover does not modify `event_domains`, `agencies` (data), `events`,
RLS, storage, or `/live/*`. There is no data restore step because there is
nothing to restore.

---

## Sign-off (mirror)

- [ ] §1 diff reviewed — bundle is byte-identical to patched staging
- [ ] §2 preflight clean (slug audit 0 rows, schemas confirmed, real slugs captured)
- [ ] §3 apply order followed
- [ ] §4 all six verify checks green against real prod slugs
- [ ] §5 DNS + SSL live, smoke matrix captured
- [ ] §6 rollback plan acknowledged
