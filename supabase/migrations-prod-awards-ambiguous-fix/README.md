# Production fix: `get_public_event_awards` ambiguous "id"

## Problem

Public Awards page fails with:

    Could not load awards: column reference "id" is ambiguous · code 42702

## Root cause

`public.get_public_event_awards` declares
`RETURNS TABLE (id uuid, ..., event_id ... )`. Inside PL/pgSQL those
output column names are in scope. The body contained:

    select event_id into v_passport_event
    from public.passports
    where id = p_passport_id;

`id` and `event_id` are ambiguous between the RETURNS TABLE output
columns and `public.passports`, so Postgres aborts before returning a
row. (Same pattern previously fixed for `get_venue_tasting_qr_codes` in
`migrations-tasting-qr-ambiguous-fix`.)

## Fix

`apply.sql` recreates the function with every column fully qualified
(`pp.id`, `pp.event_id`, etc.). No behaviour change. Safe to re-run.

## Frontend

`src/routes/live.$subdomain.awards.tsx` no longer renders the
"No awards have been added yet" empty state when the RPC errored —
only when it succeeds and returns an empty array.

## Apply

Run `apply.sql` in the Supabase SQL editor.
