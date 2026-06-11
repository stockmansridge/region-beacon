# Tasting QR Codes: Enterprise plan gate fix

## Problem

The deployed `_venue_tasting_qr_plan_allows_write(_agency_id)` helper only
allowed `'regional'` and `'pro_region'`. Enterprise organisations — which
should include all lower-tier features — were blocked from creating or
updating Tasting QR Codes at the RPC layer with
`plan_required: Tasting QR Codes are available on Regional and Pro Region plans.`

The frontend gate (`src/components/venue-tasting-qr-section.tsx`) already
includes `enterprise`, so users on Enterprise saw the section, but every
save call failed against the database.

## Fix

`apply.sql` recreates:

1. `public._venue_tasting_qr_plan_allows_write(_agency_id)` — now allows
   `regional`, `pro_region`, and `enterprise`. Normalises the plan code with
   `lower()` and `replace('-', '_')` so casing or hyphen drift cannot lock
   out a paid plan.
2. `public.save_venue_tasting_qr_code(...)` — same body as before, only the
   `plan_required` error message is updated to mention Enterprise.

`get_venue_tasting_qr_codes`, `delete_venue_tasting_qr_code`, and
`claim_venue_tasting_qr` do **not** gate on plan and need no change.

## Apply

Run `apply.sql` in the Supabase SQL editor (or via your migration tool).
Safe to run multiple times — both functions use `create or replace`.
