# Publishing gate — draft migration

Draft only. Nothing in this folder has been executed. Production untouched.

## Files

- `01_resolve_event_by_host_publishable.sql` — `CREATE OR REPLACE FUNCTION
  public.resolve_event_by_host(text)` that adds
  `and public.event_is_publishable(e.id) = true` to BOTH the event_subdomain
  branch and the event_custom branch. Marketing (`getstampd.com.au`) and
  admin (`app.getstampd.com.au`) branches are unchanged. Reserved labels
  still short-circuit to `not_found`. No first-label fallback.
- `02_verify.sql` — static checks (run as-is) plus scenario checks that
  depend on a manually-prepared fixture event in staging. Read-only — every
  destructive step is left to the operator.

## Final resolver conditions

| Host pattern                       | kind        | conditions                                                                                                                                                                                  |
|------------------------------------|-------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `getstampd.com.au` (apex)         | marketing   | exact match; `requires_auth = false`                                                                                                                                                        |
| `app.getstampd.com.au`            | admin       | exact match; `requires_auth = true`                                                                                                                                                         |
| `<label>.getstampd.com.au`        | event       | `label` not reserved AND `event_domains.status='active'` AND `event_domains.domain_type='event_subdomain'` AND `event_domains.public_subdomain=label` AND `events.status='published'` AND `event_is_publishable(events.id)=true` |
| Any other hostname (exact match)   | event       | `event_domains.status='active'` AND `event_domains.domain_type='event_custom'` AND `event_domains.custom_domain=host` AND `events.status='published'` AND `event_is_publishable(events.id)=true` |
| anything else                      | not_found   | including old `*.easypassport.com.au` hosts and arbitrary unknown hosts                                                                                                                     |

## Verification coverage

`02_verify.sql` exercises:

- `getstampd.com.au` → marketing
- `app.getstampd.com.au` (+ `:443`) → admin
- `easypassport.com.au` / `demo.easypassport.com.au` → not_found
- reserved `admin.getstampd.com.au` → not_found
- pending subdomain → not_found
- active domain + DRAFT event + comp activation → not_found
- PUBLISHED event + PENDING domain + comp activation → not_found
- published + active domain + UNPAID activation → not_found
- published + active domain + COMP activation → event
- published + active domain + ACTIVE activation → event

Fixture rows you must prepare manually in staging before scenarios run:

- one `events` row (toggle `status` between `draft` and `published` between
  scenarios)
- one `event_domains` row for that event with
  `domain_type = 'event_subdomain'`, a known `public_subdomain`, and toggle
  `status` between `pending` and `active`
- one `event_activations` row managed via `platform_set_event_activation`
  (`comp`, `unpaid`, `active` as needed)

Substitute `:event_id` and `:subdomain` at the top of `02_verify.sql` before
running. Publishing the event and activating the domain are outside the
scope of this migration — flip those columns manually for the test only.

## Rollback notes

The previous function definition lives in
`supabase/migrations-draft-domain-rename/02_resolve_event_by_host.sql` — re-running
that file restores the prior behaviour (no `event_is_publishable` gate). The
function signature, return shape, language, volatility, security mode, and
search_path are identical between the two versions, so rollback is a single
`CREATE OR REPLACE` and does not require dropping/recreating the function or
re-issuing grants. No table data is touched by either direction.

## Not in scope / not changed

- No Stripe wiring, no payment SDKs.
- No schema, RLS, storage, or service-role changes.
- No edits to `get_public_event`, `event_is_publishable`, visitor
  registration, or public check-in RPCs.
- No automatic event publishing or domain activation.
- No UI changes.
- Admin preview routes untouched.

## Status

Nothing executed. To apply on staging, run `01` then `02` (after preparing
the fixture). Do not apply on production.
