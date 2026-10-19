# Multi-device passport persistence

Additive, idempotent migration. **Review only — apply manually in the Supabase
SQL editor when approved. Do not run through automated deploys.**

## Problem

`lookup_passport_by_email` used to rotate `passports.access_token_hash` on
every email login. The original passport link and every other device stopped
working, causing perpetual re-logins across phones.

## What changes

1. **New table `public.passport_device_tokens`** — hash-only independent
   per-device bearer tokens, all resolving to the same passport. RLS enabled
   with a restrictive deny-all policy; no anon/authenticated access; tokens
   are minted and resolved only through security-definer functions.
2. **New resolver `public.resolve_passport_id_by_token(text)`** — accepts
   either the original `passports.access_token_hash` or a device token hash.
   STABLE, no writes.
3. **`lookup_passport_by_email(uuid, citext)`** — same signature and return
   shape, same 10/hour per event+email rate limit (existing
   `passport_email_logins` table). Now INSERTS a new device token and never
   modifies `passports.access_token_hash`. Device tokens are capped at 10 per
   passport (oldest pruned) so repeated logins cannot grow unbounded aliases.
4. **Every token-validating RPC redefined with ONLY its token-resolution
   predicate changed** to use the resolver. Signatures, return shapes,
   grants, rate limits, tenant checks and business logic are unchanged.

## Prerequisites

- pgcrypto installed in the `extensions` schema (the migration fails closed
  if `extensions.digest(text,text)` is missing).
- Existing `public.passports`, `public.passport_email_logins` tables.

## Affected routines (token predicate only)

- `get_passport_by_token`
- `update_marketing_consent`
- `redeem_checkin` (consolidated 7-column production version)
- `claim_bonus_code`
- `claim_venue_tasting_qr` (also removes a latent unqualified `digest()` call)
- `get_passport_stamps_by_token`
- `get_passport_rewards_by_token`
- `get_public_passport_progress` (event scope preserved; unqualified `digest()` removed)
- `toggle_passport_bookmark`, `get_passport_bookmarks`
- `update_sms_consent`
- `get_public_event_bonus_challenges` (event scope preserved)
- `lookup_passport_by_email` (mints device token instead of rotating)

Not touched: `register_participant` / `register_visitor` (original token
creation is unchanged), all admin RPCs, all scan business rules.

## Verification queries (after apply)

```sql
-- 1. Resolver accepts the original key:
select public.resolve_passport_id_by_token('<original raw token>');
-- expect the passport id.

-- 2. Email login mints a device token and does NOT rotate the original:
select access_token_hash from public.passports where id = '<passport id>';
-- note the hash, then call:
select * from public.lookup_passport_by_email('<event id>'::uuid, '<email>'::citext);
-- re-check: passports.access_token_hash MUST be unchanged;
-- passport_device_tokens MUST have one new row for the passport.

-- 3. The new device token resolves to the same passport:
select public.resolve_passport_id_by_token('<returned device token>');
-- expect the same passport id as (1).

-- 4. Every flow accepts both tokens:
select * from public.get_passport_by_token('<device token>');
select * from public.get_passport_stamps_by_token('<device token>');
select * from public.get_passport_rewards_by_token('<device token>');
select * from public.get_public_passport_progress('<event id>'::uuid, '<device token>');
select * from public.get_passport_bookmarks('<device token>');
-- expect identical results to the original token.

-- 5. Rate limit intact: 11th lookup within an hour returns zero rows.

-- 6. No direct table access:
select * from public.passport_device_tokens; -- as anon: permission denied
```

## Rollback

```sql
-- Restore the previous definitions by re-running the prior migration files
-- listed below, then drop the new objects:
drop function if exists public.resolve_passport_id_by_token(text);
drop table if exists public.passport_device_tokens;
-- Prior definitions live in:
--   migrations-draft-passport-stamps/02_fix_passport_lookup_pgcrypto.sql
--   migrations-prod-redeem-checkin-final/apply.sql
--   migrations-prod-claim-bonus-code-final-ambiguous-fix/apply.sql
--   migrations-draft-venue-tasting-qr/03_rpcs.sql
--   migrations-draft-passport-stamps/06_fix_get_passport_stamps_pgcrypto.sql
--   migrations-draft-passport-rewards/01_get_passport_rewards_by_token.sql
--   migrations-draft-points-system/03_public_passport_progress.sql
--   migrations-passport-bookmarks/apply.sql
--   migrations-prod-sms-credits/10_sms_consent_public.sql
--   migrations-prod-bonus-challenges-social-kind/apply.sql
--   migrations-passport-email-login/apply.sql
-- WARNING: rolling back invalidates every device token minted since apply;
-- original passport keys keep working throughout.
```

## Client compatibility

The app works before and after this migration: the client only calls
`lookup_passport_by_email` and the token RPCs by name with unchanged
signatures. Before the migration is applied, email login keeps the old
rotating behaviour; after it, all devices stay logged in.
