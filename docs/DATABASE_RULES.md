# Database Rules — Event Passport SaaS

## Schema Design

### Ownership Columns

- Every agency-owned table must include `agency_id`.
- Every event-owned table must include `event_id`.
- Operational tables (passports, checkins) should include **both** `agency_id` and `event_id` for security, reporting and debugging.

### Row-Level Security (RLS)

- All app tables require RLS enabled.
- Policies must enforce tenant isolation at the agency and/or event level.
- Do not create tables without RLS policies in place.

## Migration Discipline

### Additive Changes Only

- Schema changes must be additive unless specifically approved.
- Dropping columns or tables requires explicit sign-off.

### Migration Documentation

Every migration must explain:
- Affected tables
- New or changed indexes
- New or changed RLS policies
- Rollback considerations

### Schema Approval Gate

- Do not create tables until the schema has been reviewed and approved.
- No ad-hoc table creation in development without documentation.

## Security Context

- Use `SECURITY DEFINER` functions only where necessary and document why.
- Avoid recursive RLS policies that reference their own table.
- Always grant appropriate role privileges (`anon`, `authenticated`, `service_role`) per table.
