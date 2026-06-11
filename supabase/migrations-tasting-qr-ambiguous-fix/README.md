# Tasting QR: fix "column reference agency_id is ambiguous"

## Problem

Opening the Tasting QR tab in the venue editor failed with:

    column reference "agency_id" is ambiguous

## Root cause

`public.get_venue_tasting_qr_codes(_event_id, _venue_id)` declares a
`RETURNS TABLE (... agency_id uuid, event_id uuid, venue_id uuid, ...)`.
Inside PL/pgSQL, those output column names are in scope alongside the
columns of any table referenced in the body. The body contained:

    select agency_id into v_agency from public.events where id = _event_id;

Both `agency_id` and `id` are ambiguous between the RETURNS TABLE output
columns and the `public.events` table columns, so Postgres aborts with
the ambiguity error before the function ever returns a row.

## Fix

`apply.sql` recreates `get_venue_tasting_qr_codes` with every column
fully qualified (`events.agency_id`, `events.id`). No other behavior
changes. The other tasting QR functions (`save_venue_tasting_qr_code`,
`delete_venue_tasting_qr_code`, `_venue_tasting_qr_plan_allows_write`,
`claim_venue_tasting_qr`) were already qualified or do not declare
RETURNS TABLE with conflicting names.

## Apply

Run `apply.sql` in the Supabase SQL editor. Safe to re-run
(`create or replace`).
