# Domain rename draft v2 — getstamped.com.au → getstampd.com.au

**Status: DRAFT ONLY. Do not apply. No SQL has been executed.**

## Why

Product code now uses the customer-facing root `getstampd.com.au`
(see `src/lib/domains.ts → PUBLIC_TENANT_ROOT_DOMAIN`).
The deployed `public.resolve_event_by_host(text)` still hard-codes the legacy
typo `getstamped.com.au` as its suffix, so the frontend has to call
`rpcEventHost(subdomain)` to translate `*.getstampd.com.au` →
`*.getstamped.com.au` purely for RPC compatibility.

All downstream public resolvers
(`get_public_event_by_domain`, `get_public_event_legal_by_domain`,
`get_public_venues_by_domain`, `get_public_venue_by_domain`,
`get_public_event_announcements_by_domain`,
`get_public_leaderboard_by_domain`) delegate suffix matching to
`resolve_event_by_host`, so they do NOT need to be re-deployed — fixing the
one resolver fixes them all.

Source of truth for the live shape:
- `supabase/migrations-draft-domain-rename/02_resolve_event_by_host.sql`
- `supabase/migrations-draft-publishing-gate/01_resolve_event_by_host_publishable.sql`
  (current production version — publishing gate applied)

## What this draft does

1. **01_resolve_event_by_host_dual_suffix.sql** — `CREATE OR REPLACE` of
   `public.resolve_event_by_host(text)`:
   - Accepts the new primary root `getstampd.com.au` for the apex marketing
     branch, the `app.` admin branch, and the `*.getstampd.com.au` event
     subdomain branch.
   - Also accepts the legacy `getstamped.com.au` suffix for one full
     deploy cycle as a temporary safety net (lets us flip the DB without
     racing the frontend / Worker / DNS — `rpcEventHost` keeps working).
   - Signature, return type, language (plpgsql), volatility (stable),
     `SECURITY DEFINER`, `search_path = public`, and `event_is_publishable()`
     publish gate are all preserved unchanged.
   - Reserved-label check (`is_reserved_public_slug`) preserved.
   - Custom-domain branch unchanged — still exact-match on
     `event_domains.custom_domain`.
   - Re-states `grant execute … to anon, authenticated;` defensively.

2. **02_rename_platform_event_domains.sql** — data update for the two
   platform rows in `public.event_domains`:
   `getstamped.com.au` → `getstampd.com.au` (`platform_marketing`)
   and `app.getstamped.com.au` → `app.getstampd.com.au` (`platform_admin`).
   Guarded by `WHERE … = 'getstamped.com.au'` so it is a no-op if already
   renamed. Does NOT touch any agency-owned `event_custom` rows.

3. **03_verify.sql** — read-only verification queries (see below).

## Backwards compatibility window

- Both `*.getstampd.com.au` AND `*.getstamped.com.au` resolve after this
  migration is applied. That is intentional and temporary.
- Once applied + verified in production, the next cleanup pass can:
  1. Remove `rpcEventHost` from `src/lib/domains.ts` and replace its call
     sites with `tenantHost(subdomain)` (12 call sites,
     all in `src/routes/live.$subdomain.*.tsx`, `src/components/public-legal.tsx`).
  2. Apply a follow-up migration that drops the legacy `.getstamped.com.au`
     branch from `resolve_event_by_host` and removes the legacy
     `platform_marketing` / `platform_admin` rows.
  3. Retire the legacy DNS / Cloudflare cert for `*.getstamped.com.au` (out
     of scope for any SQL draft).

## What this draft does NOT do

- No DNS / Cloudflare / Worker changes.
- No frontend changes (`rpcEventHost` stays for now).
- No changes to `event`, `visitor`, `passport`, `check_in`, `venue`, or
  `consent` tables.
- No change to `event_is_publishable`, `is_reserved_public_slug`, or any
  `get_public_*_by_domain` resolver — they will pick up the new suffix
  automatically through `resolve_event_by_host`.
- No `DROP FUNCTION` — uses `CREATE OR REPLACE` so existing grants and
  dependent views/policies stay intact.

## Apply order (when approved)

```sql
\i supabase/migrations-draft-domain-rename-v2/01_resolve_event_by_host_dual_suffix.sql
\i supabase/migrations-draft-domain-rename-v2/02_rename_platform_event_domains.sql
\i supabase/migrations-draft-domain-rename-v2/03_verify.sql
```

## Rollback

`resolve_event_by_host` is `CREATE OR REPLACE` — re-apply
`supabase/migrations-draft-publishing-gate/01_resolve_event_by_host_publishable.sql`
to restore the previous body. The platform rename in `02_…` can be reversed
with the obvious symmetric UPDATE.
