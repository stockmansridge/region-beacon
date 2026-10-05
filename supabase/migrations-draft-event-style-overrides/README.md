# Draft public passport item-style overrides

Review-only additive change. Nothing in this directory has been applied.

## Apply order

1. Apply `01_event_branding_style_overrides.sql`.
2. Apply `02_public_style_override_reads.sql`. It follows the existing companion-RPC pattern and does not recreate either wide event RPC.
3. Confirm `REVOKE ALL FROM public` and `GRANT EXECUTE TO anon, authenticated` on both companion functions.
4. Verify admin update/select under existing event-scoped RLS and anonymous RPC reads for two events.

The wide RPC definitions are intentionally not copied or replaced. Existing draft directories contain several historical, mutually overwriting versions; applying a stale definition would remove newer fields.

## Compatibility

- `NULL` and `{ "version": 1, "items": {} }` resolve to no extra CSS.
- Unknown document versions, IDs, properties and invalid values are ignored by the client resolver.
- The editor must refuse to report a successful item-style save if the column or returned RPC field is unavailable.
- The old editor reads and writes the document unchanged.

## Validation

The database checks the top-level shape, version, object types and a 128 KiB limit. The application enforces the typed registry and value ranges. This avoids embedding a duplicate, brittle registry in SQL while still rejecting malformed or oversized documents.