# Stripe Checkout — GetStampd

GetStampd uses Stripe Checkout (subscription mode) for paid plan upgrades.
This is **GetStampd only**. Free stays free; Enterprise stays manual.

## Plan to price mapping

| Plan code     | Lovable env var            | Notes                          |
|---------------|----------------------------|--------------------------------|
| `starter`     | `STRIPE_PRICE_STARTER`     | Annual                         |
| `growth`      | `STRIPE_PRICE_GROWTH`      | Annual                         |
| `regional`    | `STRIPE_PRICE_REGIONAL`    | Annual                         |
| `pro_region`  | `STRIPE_PRICE_PRO_REGION`  | Annual                         |
| `free`        | —                          | No checkout. Default plan.     |
| `enterprise`  | —                          | Manual upgrade request flow.   |

Create one Stripe **Product** per paid plan in the Stripe dashboard, then
one recurring **Price** (yearly) per product. Copy the `price_...` IDs into
the environment variables above.

## Required environment variables

All server-only. Never expose to the browser.

- `STRIPE_SECRET_KEY` — secret key (`sk_test_...` for test, `sk_live_...` for live).
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_...`) from the
  webhook endpoint in the Stripe dashboard.
- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_REGIONAL`,
  `STRIPE_PRICE_PRO_REGION` — recurring price IDs.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` —
  already required by the server runtime.

Add them in **Lovable Cloud → Secrets**.

## Endpoints

### `createStripeCheckout` (server function)

Defined in `src/lib/stripe-checkout.functions.ts`. Called by the Account &
Billing pricing card buttons.

- Verifies the caller's Supabase session.
- Confirms the caller is an `agency_owner` / `agency_admin` of the target
  agency, or a platform admin.
- Maps `plan_code` to the Stripe price ID.
- Reuses or creates a Stripe customer (stored on
  `public.agency_billing_accounts.stripe_customer_id`).
- Creates a Stripe Checkout Session in `subscription` mode with:
  - `success_url`: `${origin}/admin/account?checkout=success`
  - `cancel_url`: `${origin}/admin/account?checkout=cancelled`
  - `metadata.agency_id`, `metadata.plan_code`, `metadata.user_id`
  - `subscription_data.metadata.agency_id`, `subscription_data.metadata.plan_code`
- Returns the Checkout Session URL for the browser to redirect to.

### `/api/public/stripe-webhook` (server route)

Defined in `src/routes/api/public/stripe-webhook.ts`. Stripe calls this
endpoint directly — signature verification is mandatory.

Webhook events to enable in the Stripe dashboard:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The handler writes to `public.agency_subscriptions` (upsert by
`stripe_subscription_id`) using the service-role Supabase client. Browser
clients never write subscription state.

Webhook URL (production):
`https://www.getstampd.com.au/api/public/stripe-webhook`

Webhook URL (preview, for testing):
`https://project--481bb391-4845-4595-9174-36e7e5516010-dev.lovable.app/api/public/stripe-webhook`

## Subscription status mapping

Stripe → `agency_subscriptions.status`:

| Stripe status                                | Stored status |
|----------------------------------------------|---------------|
| `active`                                     | `active`      |
| `trialing`                                   | `trialing`    |
| `past_due`                                   | `past_due`    |
| `unpaid`                                     | `past_due`    |
| `canceled`                                   | `cancelled`   |
| `incomplete`, `incomplete_expired`           | `incomplete`  |
| `paused`                                     | `paused`      |

## Local testing

1. Install the Stripe CLI: <https://stripe.com/docs/stripe-cli>.
2. `stripe login`.
3. Forward webhooks to the local dev preview:
   `stripe listen --forward-to https://<preview-url>/api/public/stripe-webhook`
4. Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.
5. Use Stripe test cards (e.g. `4242 4242 4242 4242`) in Checkout.
6. Verify the row appears in `public.agency_subscriptions`.

## Production deployment

1. Switch `STRIPE_SECRET_KEY` to the live key (`sk_live_...`).
2. In the Stripe dashboard, create live mode products and prices, then
   update the `STRIPE_PRICE_*` env vars.
3. Create a live webhook endpoint pointed at
   `https://www.getstampd.com.au/api/public/stripe-webhook` with the four
   subscription events listed above.
4. Copy the live `whsec_...` into `STRIPE_WEBHOOK_SECRET`.
5. Redeploy.

## Fallback flows

- `enterprise`: keep the existing `upgrade_requests` flow ("Talk to us").
- If a paid checkout fails (Stripe not configured, network error, etc.) the
  Account & Billing page surfaces the error and the user can still submit
  an upgrade request manually.

## Security notes

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only. They are
  never read in any module without the `.server.ts` suffix or inside a
  `createServerFn` `.handler()` body.
- `createStripeCheckout` validates Supabase identity AND agency membership
  before creating a session — `plan_code` and `agency_id` from the browser
  are not trusted on their own.
- Only the webhook (running with the service-role key) writes to
  `agency_subscriptions`. The browser never updates billing state directly.
- Webhook signatures are verified with `stripe.webhooks.constructEventAsync`
  before any database write.
