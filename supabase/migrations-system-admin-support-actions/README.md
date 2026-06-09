# System Admin Support Actions audit log

Adds `public.admin_support_actions` (platform-admin readable) and
`public.system_admin_log_support_action(...)` RPC used by the System Admin
→ User auth diagnostics card to record operational support actions such as
resending a verification email.

Apply `apply.sql` once via the Supabase SQL editor. Idempotent.
