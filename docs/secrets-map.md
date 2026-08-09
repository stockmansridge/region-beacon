# Where each secret belongs

There are three **runtimes**, not three secret stores by choice. Each runtime can
only read its own environment, so a secret must live in every runtime that
actually executes the code using it.

| Runtime | What runs there | Secret store |
|---|---|---|
| Lovable-hosted SSR (preview + `*.lovable.app`) | server functions (`*.functions.ts`), `/api/*` routes | Lovable Cloud secrets |
| Cloudflare Worker `region-beacon` | the same app code, but for `getstampd.com.au` / `getstamped.com.au` | Worker → Settings → Variables and Secrets |
| Supabase Edge Functions | `supabase/functions/stripe-webhook`, `create-stripe-checkout`, `stripe-env-check` | Supabase → Edge Functions → Secrets |

Rule of thumb:
- Called from app server code → **Lovable Cloud + Cloudflare Worker** (both).
- Called from a Supabase Edge Function → **Supabase only**.
- Public/publishable values → in code / `VITE_*`, no secret store needed.

## Map

| Secret | Lovable Cloud | Cloudflare Worker | Supabase | Notes |
|---|:--:|:--:|:--:|---|
| `GETSTAMPD_SUPABASE_URL` | optional | optional | n/a | Public URL; hardcoded fallback exists in `admin.server.ts`. |
| `GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | n/a (Supabase injects `SUPABASE_SERVICE_ROLE_KEY`) | Server-only, bypasses RLS. |
| `GETSTAMPD_SUPABASE_PUBLISHABLE_KEY` | optional | optional | n/a | Publishable; safe in code. |
| `STRIPE_SECRET_KEY` (live) | ✅ | ✅ | ✅ | App checkout + edge checkout both use it. |
| `STRIPE_TEST_SECRET_KEY` (sandbox) | ✅ | ✅ | ✅ (only if edge fn handles test mode) | SMS test mode. |
| `STRIPE_WEBHOOK_SECRET` | — | — | ✅ | Only the Supabase webhook verifies signatures. |
| `STRIPE_TEST_WEBHOOK_SECRET` | — | — | ✅ | Sandbox webhook endpoint signing secret. |
| `STRIPE_PRICE_STARTER` / `_GROWTH` / `_REGIONAL` / `_PRO_REGION` | ✅ | ✅ | ✅ | Not secret-sensitive, but read server-side in both places. |
| `MAPKIT_KEY_ID` / `MAPKIT_TEAM_ID` / `MAPKIT_PRIVATE_KEY` | ✅ | ✅ | — | Used by `src/lib/mapkit.functions.ts` (app server only). |
| `RESEND_API_KEY` | ✅ (connector-managed) | ✅ | — | Passport signup emails via app server fn. |
| `LOVABLE_API_KEY` | ✅ (managed) | — | — | Lovable AI Gateway; rotate via Lovable only. |

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DEPLOY_TARGET` are
build-time public values — they belong in the build config, never in a secret store.

## Verifying what a runtime can see

- Cloudflare Worker: `https://getstampd.com.au/debug/worker-health`
- Supabase Edge Functions: `curl https://kyjwifumacnrpgyextzz.supabase.co/functions/v1/stripe-env-check`

Both report boolean presence only, never values.

## How to reduce this to one store

1. Move `stripe-webhook` into the app as `/api/public/webhooks/stripe` → the two
   `STRIPE_*_WEBHOOK_SECRET` entries leave Supabase entirely.
2. Move `create-stripe-checkout` + `stripe-env-check` logic into server functions
   (already largely duplicated in `src/lib/stripe.server.ts`) → Supabase secrets
   become unnecessary.
3. Serve `getstampd.com.au` as a Lovable custom domain instead of the self-hosted
   `region-beacon` Worker → Cloudflare secrets become unnecessary.

After all three, **Lovable Cloud secrets are the single source of truth.**
