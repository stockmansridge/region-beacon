# Participant fields + consents (production migration)

Apply in the Supabase SQL editor **in this order**:

1. `01_event_participant_field_settings.sql`
   Adds `events.require_name` (default `true`) and `events.require_mobile`
   (default `false`), and extends `get_event_registration_settings(_hostname)`
   to return all three field settings. `require_postcode` is untouched.

2. `02_participant_consent_state.sql`
   Adds `participant_consent_state(event_id)` — the single canonical
   calculation of current Terms / SMS / Marketing state (plus timestamps), and
   an index for consent lookups.

3. `03_register_participant.sql`
   Adds `register_participant(...)` — one transactional public signup RPC that
   creates/resolves the participant, saves fields, and records all three
   consent decisions (including explicit opt-outs). Enforces the event's field
   settings server-side. `register_visitor()` and `update_sms_consent()` stay
   in place for backward compatibility and later preference changes.

4. `04_admin_event_participants_consents.sql`
   Recreates `get_admin_event_participants_with_points(event_id)` with
   `postcode`, `terms_status`, `terms_accepted_at`, `sms_status`,
   `sms_consent_updated_at`, `marketing_status`, `marketing_consent_updated_at`.
   Still one row per participant.

## Properties

- Additive only. No column drops, no table rebuilds, no data deletion.
- Idempotent (`add column if not exists`, `create or replace`, guarded inserts).
- Nothing is backfilled. Missing consent history reads as `not_recorded`,
  never as `false`.
- Existing SMS opt-ins recorded by `migrations-prod-sms-credits` continue to
  display, because `participant_consent_state` falls back to
  `visitors.sms_opt_in` when no ledger row exists.

## Frontend behaviour before these are applied

The app feature-detects: the join form falls back to the previous
`register_visitor` + `update_sms_consent` path when `register_participant` does
not exist, and the admin settings card / Participants columns degrade to the
previously deployed behaviour.
