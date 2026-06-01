# Event Announcements — production apply

This folder contains a single idempotent SQL file you can paste straight
into the Supabase SQL editor to make announcements work end-to-end on
production.

**Why this exists:** the original draft in
`supabase/migrations-draft-event-announcements/` ships across three files
(01 schema, 02 public RPC, 04 RLS fix). If only 01 was applied — or if it
was applied as-written — the always-false `deny_all` restrictive policy
silently blocks every authenticated INSERT/UPDATE, so the admin "Save"
button appears to succeed (no client error) but no row lands. The RPC
then returns zero rows on the public page.

`apply.sql` is safe to run repeatedly. It:

1. Creates `public.event_announcements` (if missing), indexes, grants, and
   the `updated_at` trigger.
2. Drops the bad restrictive `deny_all` policy and re-asserts the three
   correct permissive policies (platform admin, agency admin, agency
   member read).
3. (Re)installs `public.get_public_event_announcements_by_domain(text)`,
   the SECURITY DEFINER RPC the public bar calls.

No data is touched. No table is dropped. No anon grant is added to the
table itself — anon reads only via the RPC.

## How to run

1. Open the Supabase SQL editor for the production project.
2. Paste the contents of `apply.sql`.
3. Run it once.

## Verify

```sql
-- Policies present (3 rows expected, no row named deny_all):
select policyname from pg_policies where tablename = 'event_announcements';

-- Public RPC returns rows for a live event host:
select * from public.get_public_event_announcements_by_domain(
  '<your-subdomain>.getstampd.com.au'
);
```

Then in the admin, open any event → Announcements → save a message with
`is_active = true`. Visit the public event page in an incognito window:
the message should appear as a compact banner at the top.
