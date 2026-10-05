# Isolate V2 branding per event

## Goal
Keep the current public experience as the central V1 template, while adding one central V2 rendering path whose branding belongs only to the selected event and agency. Existing events remain on V1 unless an authorised user explicitly activates V2 for that event.

## Implementation

1. **Separate event-owned V2 data from V1 branding**
   - Extend the review-only `event_branding` migration with two distinct fields: `public_template_version` (`v1`/`v2`, default/fallback `v1`) and `v2_style_config` (the sparse, versioned V2 document).
   - Keep the style document’s schema version independent from the selected public template version.
   - Retain all existing V1 branding columns unchanged so switching an event back to V1 restores its prior appearance.
   - Constrain and validate the new values, preserve existing table grants/RLS, and document rollback. No SQL will be applied.

2. **Create central V1 and V2 render paths**
   - Preserve the current `EventPublicLanding` behavior as V1.
   - Add a central template dispatcher and V2 wrapper/path that uses the real shared public components plus V2-only stable element markers and override resolution.
   - Revert or gate split-field forwarding and style injection that could globally alter V1 rendering.
   - Missing or unknown template versions resolve to V1. No customer-specific page forks or shared customer colours/fonts.

3. **Make public reads event-authoritative**
   - Update the review-only companion RPC contract to return the selected event’s template version and V2 config together, joined by both `agency_id` and `event_id` after the normal hostname or agency/slug resolution.
   - Feed that same event-owned result into hostname routes, `/live` routes, tenant routes, and public passport page loaders.
   - Keep unpublished/private checks and existing public-read restrictions intact.

4. **Separate V2 editor drafts from V1 fields**
   - Opening V2 seeds an in-memory V2 draft from the event’s resolved V1 appearance without writing or changing the live template.
   - Item edits write only to the V2 config; they do not mutate V1 fields or Brand Kit metadata.
   - Scope selection, undo/redo history, loaded fonts, preview state, and draft state by `agency_id + event_id`; reset safely when changing events under the existing unsaved-change guard.
   - Continue using the real V2 renderer in preview and keep interaction interception preview-only.

5. **Add explicit atomic activation and rollback**
   - Show live template status in V2 and add an explicit **Use V2 for this event** action for legacy events.
   - Save V2 config and set that event’s template to V2 in one confirmed database operation; never report success if either part fails.
   - Provide an explicit revert-to-V1 action that changes only template selection and leaves both V1 branding and saved V2 config intact.
   - Reuse current agency/event permission checks; read-only users can preview but cannot activate or save.

6. **Continue full V2 public-page coverage**
   - Move stable IDs and corrected style semantics into V2-only application points across every audited public passport page/state.
   - Keep V1 coupling and mappings unchanged where changing them would restyle legacy events.
   - Use stable event-owned record IDs for venue/reward overrides and anonymous template slots for visitor activity.

7. **Audit and verification**
   - Update the audit document with the central V1/V2 model, per-event ownership, activation lifecycle, inheritance, compatibility differences, and truthful page/state status.
   - Add local resolver/dispatcher/isolation checks for Events A–D, unknown-version fallback, empty/open preview no-write behavior, and rollback.
   - Run automatic build checks and inspect the V1/V2 preview locally. Persistence, permission, hostname, and cross-session checks remain explicitly unverified until the review-only migration is authorised in an isolated environment.

## Technical details

```text
agency + event
    └── event_branding
        ├── existing V1 fields (unchanged)
        ├── public_template_version: v1 | v2
        └── v2_style_config
            ├── schema version
            ├── sparse item defaults
            └── sparse stable-record overrides

public request → resolve exact event → read template selection → V1 renderer OR central V2 renderer
admin V2 preview → event-scoped draft → explicit atomic save + activation
```

No production migration, publish, deployment, customer configuration change, or customer action will be performed.
