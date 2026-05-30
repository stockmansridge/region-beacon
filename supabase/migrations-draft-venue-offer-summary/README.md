# Draft: venues.offer_summary

Status: **DRAFT — NOT EXECUTED**

Adds a single nullable `offer_summary text` column to `public.venues` with a
`CHECK` constraint limiting it to 800 characters (trimmed) when not null,
so each venue can display a short "About their offer" paragraph on its
public profile.

## Why not `venue_offers`?

`supabase/migrations-draft/14_venue_offers.sql` already defines a richer
`venue_offers` table (title, description, redemption_instructions, type,
date windows). That table is **not** live and depends on policies/RPCs
that have not been drafted. For the MVP we only need a single paragraph
of free-text copy, so an additive column on `venues` is significantly
smaller surface area and unblocks the admin editor and public profile
page today. The richer `venue_offers` table remains the future home for
real offer redemption and date-windowed offers.

## Apply order

1. `01_venues_offer_summary.sql` — additive column + length check.
2. Apply
   `supabase/migrations-draft-public-venue-pages/01_get_public_venues_by_domain.sql`
   which drops + recreates `get_public_venue_by_domain(text, uuid)` so
   `offer_summary` is projected on the venue detail response. The list RPC
   `get_public_venues_by_domain(text)` is unchanged shape-wise.

## Privacy

The detail RPC only projects public venue fields (name, description,
offer_summary, address, website_url, phone, logo_path, cover_path, lat,
lng, order_index). No QR tokens, visitor data, passport data, check-in
data, admin/internal fields, or billing data are exposed. `SECURITY
DEFINER` is used with an explicit `search_path = public`, and `EXECUTE`
is granted only to `anon` and `authenticated`.

## Verification

```sql
-- 1) Column exists and is nullable
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'venues'
  and column_name = 'offer_summary';
-- Expected: offer_summary | text | YES

-- 2) Length constraint exists
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'venues_offer_summary_len';

-- 3) RPC return shape includes offer_summary
select
  p.proname,
  oidvectortypes(p.proargtypes) as args,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_public_venue_by_domain';

-- 4) Live smoke test (replace with a real published host + venue id)
select *
from public.get_public_venue_by_domain(
  'cargordtrail.getstamped.com.au'::text,
  '66b1b161-068e-4d7c-b5ff-9d0761ffa594'::uuid
);
```

## Rollback

See trailing comment block in `01_venues_offer_summary.sql`. The public
venue page RPC can be rolled back by re-running the previous version of
`get_public_venue_by_domain` (without `offer_summary`) from git history.
