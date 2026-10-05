# Draft public passport item-style overrides

Review-only additive change. Nothing in this directory has been applied.

## Apply order

1. Apply `01_event_branding_style_overrides.sql`.
2. Recreate the current production `get_public_event_by_domain(text)` and `get_public_event_by_agency_and_slug(text,text)` definitions with `style_overrides jsonb` appended to each return table and `b.style_overrides` appended to each SELECT.
3. Restore `REVOKE ALL FROM public` and `GRANT EXECUTE TO anon, authenticated` on both functions.
4. Verify admin update/select under existing event-scoped RLS and anonymous RPC reads for two events.

The RPC definitions are intentionally not copied here until the exact production definitions are confirmed. Existing draft directories contain several historical, mutually overwriting versions; applying a stale full definition would remove newer fields.

## Compatibility

- `NULL` and `{ "version": 1, "items": {} }` resolve to no extra CSS.
- Unknown document versions, IDs, properties and invalid values are ignored by the client resolver.
- The editor must refuse to report a successful item-style save if the column or returned RPC field is unavailable.
- The old editor reads and writes the document unchanged.

## Validation

The database checks the top-level shape, version, object types and a 128 KiB limit. The application enforces the typed registry and value ranges. This avoids embedding a duplicate, brittle registry in SQL while still rejecting malformed or oversized documents.