# Domain rename draft — easypassport.com.au → getstampd.com.au

Status: **DRAFT — do not execute.**

The platform is being renamed from Easy Passport to **GetStampd** and the
primary domain from `easypassport.com.au` to `getstampd.com.au`. Staging
already has `event_domains` rows and a `resolve_event_by_host` RPC seeded
against the old hostnames, so the rename cannot be done silently from the
frontend — it requires a coordinated DB change.

## What this draft proposes

1. **Rename platform rows in `public.event_domains`**
   - `easypassport.com.au`     → `getstampd.com.au`     (`platform_marketing`)
   - `app.easypassport.com.au` → `app.getstampd.com.au` (`platform_admin`)

2. **Replace hardcoded host checks inside `public.resolve_event_by_host`**
   - Root constant: `easypassport.com.au`  → `getstampd.com.au`
   - Suffix constant: `.easypassport.com.au` → `.getstampd.com.au`
   - Admin host check: `app.easypassport.com.au` → `app.getstampd.com.au`
   - Net effect: event subdomain resolution becomes
     `{event}.getstampd.com.au`.

3. **No schema changes.** No new columns, no enum changes, no policy
   changes, no storage buckets. RLS is unaffected.

4. **No data churn.** Visitor / passport / check-in data is untouched.

## What is NOT in this draft

- No Stripe wiring.
- No public visitor signup activation.
- No visitor registration RPC changes.
- No check-in RPC changes.
- No service-role key exposure.
- No production execution.

## Ordering / safety

- File `01_rename_platform_domains.sql` updates `event_domains` first.
- File `02_resolve_event_by_host.sql` then replaces the RPC.
- Both must run inside the same transaction on staging only.
- Old rows are renamed in place (not deleted+inserted) so any FK or audit
  references continue to point at the same row id.

## Verification (run after applying)

```sql
-- 1. Platform rows now use the new domain.
select custom_domain, domain_type, status
from public.event_domains
where domain_type in ('platform_marketing','platform_admin')
order by domain_type;

-- 2. resolve_event_by_host returns the right role for each host shape.
select * from public.resolve_event_by_host('getstampd.com.au');         -- marketing
select * from public.resolve_event_by_host('app.getstampd.com.au');     -- admin
select * from public.resolve_event_by_host('app.getstampd.com.au:443'); -- admin (port stripped)
select * from public.resolve_event_by_host('example.getstampd.com.au'); -- unseeded event subdomain
select * from public.resolve_event_by_host('admin.getstampd.com.au');   -- reserved label rejected

-- 3. Old hostnames no longer resolve.
select * from public.resolve_event_by_host('easypassport.com.au');       -- expect: none / unknown
select * from public.resolve_event_by_host('app.easypassport.com.au');   -- expect: none / unknown
```
