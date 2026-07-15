# Prod fix — `claim_bonus_code` final ambiguous `event_id`

## Symptom

Scanning a bonus QR code at `/collect/bonus/:token` shows:

```text
Something went wrong
column reference "event_id" is ambiguous
```

## Cause

The earlier `claim_bonus_code` fixes qualified the regular `SELECT`/`WHERE`
references, but the function still declares `RETURNS TABLE (... event_id uuid, ...)`.
That output column is an in-scope PL/pgSQL variable, and the previous
`ON CONFLICT (event_id, participant_id, award_type, source_id)` clause can still
collide with the `participant_point_awards.event_id` column during execution.

## Fix

`apply.sql` recreates `public.claim_bonus_code` with the same signature and output
shape, but removes the bare `ON CONFLICT (event_id, ...)` clause entirely. The
bonus award insert now uses a fully-qualified `NOT EXISTS` idempotency check, with
a `unique_violation` fallback for concurrent scans.

It also keeps the `extensions.digest(...::text, 'sha256'::text)` fix from the
previous production migration.

## Apply

Run `apply.sql` in the production SQL editor. Safe to re-run.

This is the only production SQL you need for the loop: it fixes both observed
runtime failures in the live function body:

- `function digest(text, unknown) does not exist`
- `column reference "event_id" is ambiguous`

The older `migrations-prod-claim-bonus-code-ambiguous-fix` and
`migrations-prod-claim-bonus-code-digest-fix` folders have also been updated to
the same final body so re-running an older folder cannot regress production.

## Verify

Scan a bonus QR with a valid event passport. Expected result is either
`Bonus points collected` or `Already collected`, not the ambiguous `event_id`
error.
