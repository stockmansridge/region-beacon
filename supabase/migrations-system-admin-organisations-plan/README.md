# System Admin — Organisations table: expose effective plan

Apply `apply.sql` in the Supabase SQL editor.

## What it does

Replaces `public.system_admin_organisations()` so it returns four extra
columns alongside the existing rollups:

- `effective_plan_code` — `free | starter | growth | regional | pro_region | enterprise`
- `plan_source` — `manual_override | subscription | default`
- `manual_plan_override` — raw override value on `agencies` (nullable)
- `manual_plan_override_at` — when the override was set

Resolution is delegated to `public.get_agency_plan_limits(uuid)`, so the
priority order matches the rest of the app:

```
manual_plan_override ?? active_subscription_plan ?? free
```

## Safety

- Idempotent (`create or replace`).
- SECURITY DEFINER, gated by `public._require_platform_admin()`.
- Read-only. No existing column or row is mutated.
- Backward compatible: previously-returned columns keep their names, types,
  and order; new columns are appended.
