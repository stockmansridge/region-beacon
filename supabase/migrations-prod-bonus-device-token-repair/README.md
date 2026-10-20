# P0 printed bonus QR repair

**Production application NOT performed by this session.** The external GetStampd-Prod database is not connected to the available SQL tools; the read-only CLI and schema tool both failed before accessing it. Do not enable a new Lovable Cloud database as a substitute.

## Immediate database-only repair

Target: GetStampd-Prod `kyjwifumacnrpgyextzz`. Run `verify.sql` first and retain the owner/grants and signature output. Run **only `apply.sql`**, not the full device migration, then rerun `verify.sql`. Expected: `security_definer`, `venue_aware`, `device_aware`, `conflict_safe` all true; signature, result and grants unchanged. No frontend publication is needed.

`apply.sql` replaces only `public.claim_bonus_code(text,text)` and reloads the API schema cache. CREATE OR REPLACE preserves existing ownership and grants. No tables, QR tokens, passports, awards or event settings are changed by applying it. It requires existing bonus/child tables, the central token resolver and the partial unique index on `(event_id,participant_id,award_type,source_id)` where `source_id IS NOT NULL`.

Event-wide token source is the parent bonus ID. Per-venue token source is the child ID, with parent ID/name and correct venue ID in metadata. Parent/child active checks, published event checks and agency/event matching apply. Device aliases and original tokens use the same existing resolver. Duplicate inserts use the existing partial unique index, not a racy pre-check.

## Verification

`rollback-test.sql` is **prepared, not run in production**. It selects existing eligible Orange Wine Quest bonus and passport records, adds two temporary test aliases, claims both QR paths and duplicates, checks source/metadata/award counts and the unchanged original passport hash, then rolls back everything. It returns no raw tokens or personal data. Use one SQL session; on any error, issue ROLLBACK before continuing. It fails closed if no suitable records exist. Run in a controlled window: concurrent legitimate scans can invalidate count assertions. Neither Google nor frontend requests are involved.

Local tests execute the actual function in PGlite PostgreSQL against isolated fixtures: original compatibility, A/B aliases, both QR sources, duplicate prevention, inactive/tenant/event gates and migration body equality. They do not establish production deployment or physical-device success.

## Prevent recurrence / rollback

The device migration's claim function is corrected to the identical venue-aware body; the regression test enforces equality. Do not reapply the full device migration to production for this incident. To roll back a function deployment, use the exact pre-deployment function definition captured by the database operator; rolling back to the known broken definition will stop printed venue QRs again. No data rollback is required for the function-only repair.
