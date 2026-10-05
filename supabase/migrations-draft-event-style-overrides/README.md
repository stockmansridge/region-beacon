# Draft event-isolated V2 public template

Review-only additive change. Nothing in this directory has been applied.

## Apply order

1. Apply `01_event_branding_style_overrides.sql` after schema review.
2. Apply `02_public_style_override_reads.sql`. It follows the existing companion-RPC pattern and does not recreate either wide event RPC.
3. Apply `03_save_event_v2_branding.sql` to add the atomic draft-save/activation operation.
4. Confirm grants, existing event-branding RLS, and agency/event isolation before enabling the UI in an authorised test environment.

The wide RPC definitions are intentionally not copied or replaced. Existing draft directories contain several historical, mutually overwriting versions; applying a stale definition would remove newer fields.

## Compatibility

- Missing/NULL/unknown `public_template_version` resolves to V1. Existing events are not backfilled or upgraded.
- `v2_style_config` is independent of V1 fields; reverting selection to V1 restores the prior renderer and branding.
- Public RPCs return V2 configuration only for a publishable event that is explicitly selected as V2.
- Unknown document versions, IDs, properties and invalid values are ignored by the client resolver.
- The editor must refuse to report a successful item-style save if the column or returned RPC field is unavailable.
- The old editor does not write or strip V2 configuration.

## Validation

The database checks the top-level shape, version, object types and a 128 KiB limit. The application enforces the typed registry and value ranges. This avoids embedding a duplicate, brittle registry in SQL while still rejecting malformed or oversized documents.