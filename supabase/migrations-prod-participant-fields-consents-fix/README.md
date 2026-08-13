# Participant fields + consents — PRODUCTION REPAIR

Apply `apply.sql` once in the Supabase SQL editor. It is idempotent and safe to re-run.

## Live production audit (what was actually wrong)

| Object | Expected | Found in production |
| --- | --- | --- |
| `events.require_name` | boolean, default true | **missing** |
| `events.require_mobile` | boolean, default false | **missing** |
| `events.require_postcode` | boolean | present |
| `register_participant(...)` | transactional signup RPC | **missing (no overloads)** |
| `participant_consent_state(uuid)` | canonical consent calc | **missing** |
| `get_admin_event_participants_with_points(p_event_id uuid)` | with postcode + consents | present, **old return shape** |
| `visitors.full_name / mobile / mobile_e164 / postcode / sms_opt_in / marketing_opt_in` | present | present |
| `visitor_consents` | ledger | present |
| `sms_normalise_au_mobile(text)`, `event_is_publishable(uuid)`, `resolve_event_by_host(text)` | present | present |

Root cause: `supabase/migrations-prod-participant-fields-consents/APPLY_ALL.sql` was never
run, so the join form's silent fallback to `register_visitor()` ran on every signup. That
legacy RPC writes no consent rows, which is why a participant appeared with email only and
all three consents read "Not recorded".

## Frontend change shipped alongside this

`src/routes/live.$subdomain.join.tsx` no longer falls back to `register_visitor` /
`update_sms_consent`. It calls `register_participant` only; on failure it logs the real
Postgres code/message/details/hint to the console, shows an explicit error, and does **not**
create a partial participant. So this SQL must be applied before the next signup.

## Data path after applying

```
join form  ->  register_participant()   (one transaction)
               |-- public.visitors        name, email, mobile, mobile_e164, postcode
               |-- public.passports       passport + access token
               '-- public.visitor_consents terms, privacy, sms (yes OR no), marketing (yes OR no)
                          |
        participant_consent_state(event_id)   keyed on visitor_id
                          |
        get_admin_event_participants_with_points(event_id)
                          |
            Participants tab  +  CSV / Excel export
```

## Guarantees

- Additive only: no column, table, row or consent record is dropped or rewritten.
- Explicit opt-outs are stored as `decision = 'withdrawn'` ledger rows, so "said no" is
  distinguishable from "never asked" (`not_recorded`). Missing history is never an opt-out.
- SMS and Marketing remain separate consent types and are never merged.
- SMS consent is never inferred from the presence of a phone number.
- Consent writes are idempotent — a retry with the same answers appends no duplicate row.
- Field requirements are enforced server-side, so a direct RPC call cannot bypass them.

## Verification

The verification queries are at the bottom of `apply.sql`. Run steps 1–5 after applying:
they walk one test signup from `visitors` -> `visitor_consents` ->
`participant_consent_state` -> the exact rows the Participants screen and export read.
