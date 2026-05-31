# Domain cleanup draft v2 — single owned root `getstampd.com.au`

**Status: DRAFT ONLY. Do not apply. No SQL has been executed.**

## Why

An earlier typo domain was removed from product code because it is not
owned. The deployed `public.resolve_event_by_host(text)` still hard-codes
the typo as its suffix check, so the frontend had to use a temporary bridge
to translate hosts. This draft replaces the resolver so it accepts only the
correct, owned root `getstampd.com.au`.

The bridge in `src/lib/domains.ts` (`rpcEventHost`) has now been removed,
and every caller passes `tenantHost(subdomain)` directly. The frontend and
DB will be consistent once this migration is applied.

## What this draft does

1. **`01_resolve_event_by_host.sql`** — `CREATE OR REPLACE` of
   `public.resolve_event_by_host(text)`:
   - Root constant: `getstampd.com.au`
   - Suffix constant: `.getstampd.com.au`
   - Apex marketing, admin (`app.…`), and `*.…` event-subdomain branches
     all use the single owned root.
   - Signature, return type, language (plpgsql), volatility (stable),
     `SECURITY DEFINER`, `search_path = public`, publishing gate via
     `event_is_publishable()`, reserved-label check, and custom-domain
     branch all preserved unchanged.
   - Re-states `grant execute … to anon, authenticated;`.
   - Does **not** keep any backwards-compatible alias for the earlier
     typo domain.

2. **`02_rename_platform_event_domains.sql`** — corrects the two platform
   rows in `public.event_domains` (`platform_marketing`, `platform_admin`)
   if they still point at the earlier typo string. Idempotent. Does not
   touch any agency-owned `event_custom` or `event_subdomain` rows.

3. **`03_verify.sql`** — read-only checks confirming apex, admin, a real
   published event subdomain, and each downstream public RPC resolve on
   the correct root; and that the platform rows now use the correct root
   exclusively.

## Backwards compatibility

None. The earlier typo domain is intentionally not supported. Frontend has
already been updated to pass only `*.getstampd.com.au` hosts to
`resolve_event_by_host`.

## What this draft does NOT do

- No DNS / Cloudflare / Worker changes.
- No changes to `events`, `visitors`, `passports`, `check_ins`, `venues`,
  or `consents`.
- No change to `event_is_publishable`, `is_reserved_public_slug`, or any
  `get_public_*_by_domain` resolver — they pick up the new suffix
  automatically through `resolve_event_by_host`.
- No `DROP FUNCTION` — uses `CREATE OR REPLACE` so existing grants and
  dependent views/policies stay intact.

## Apply order (when approved)

```sql
\i supabase/migrations-draft-domain-rename-v2/01_resolve_event_by_host.sql
\i supabase/migrations-draft-domain-rename-v2/02_rename_platform_event_domains.sql
\i supabase/migrations-draft-domain-rename-v2/03_verify.sql
```

## Rollback

`resolve_event_by_host` is `CREATE OR REPLACE` — re-apply the previous
publishing-gate version to restore its body. The platform rename in `02_…`
is reversible with the symmetric UPDATE.
