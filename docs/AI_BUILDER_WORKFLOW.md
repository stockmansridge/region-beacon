# AI Builder Workflow — Event Passport SaaS

## Before Making Major Changes

1. **Identify affected areas**
   - List affected pages, components, tables, policies and functions.
   - Note whether the change touches the visitor flow, admin flow, or both.

2. **Assess migration needs**
   - Explain whether the change requires a database migration.
   - If yes, draft the migration and note rollback steps.

3. **Assess security impact**
   - Explain whether the change affects RLS or security boundaries.
   - If yes, document the new or updated policies.

## Change Discipline

- Keep changes small and testable.
- Provide test steps after each change.
- Provide rollback notes after each change.
- Never silently change authentication, database policies or export permissions.
- Never introduce real production data into development prompts or test fixtures.

## Documentation Updates

- If a change affects the security model, update `SECURITY_MODEL.md`.
- If a change affects the MVP scope, update `MVP_SCOPE.md`.
- If a change adds new database rules, update `DATABASE_RULES.md`.
