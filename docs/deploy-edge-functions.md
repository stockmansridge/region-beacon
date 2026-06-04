# Deploy GetStampd Edge Functions

The Supabase Edge Functions in `supabase/functions/` must be deployed manually. Lovable does not have CLI access to the external GetStampd Supabase project (`kyjwifumacnrpgyextzz`).

## Prerequisites

1. **Install Supabase CLI**
   ```bash
   # macOS
   brew install supabase/tap/supabase
   ```
   See: https://supabase.com/docs/guides/cli/getting-started

2. **Log in**
   ```bash
   supabase login
   ```
   This opens a browser to authenticate with your Supabase account.

3. **Secrets must already exist**
   The Edge Functions read secrets from Supabase Edge Function Secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_STARTER`
   - `STRIPE_PRICE_PRO`
   - `STRIPE_PRICE_ENTERPRISE`
   - `STRIPE_WEBHOOK_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Set these in Supabase Dashboard → Project Settings → Edge Functions → Secrets before deploying.

## Deploy

Run the provided script from the repo root:

```bash
chmod +x scripts/deploy-edge-functions.sh
scripts/deploy-edge-functions.sh
```

The script will:
1. Check that the Supabase CLI is installed
2. Link the project (`kyjwifumacnrpgyextzz`)
3. Deploy all three functions:
   - `stripe-env-check`
   - `create-stripe-checkout`
   - `stripe-webhook`
4. Print the public URLs to test

## Verify Deployment

After running the script, open the Supabase Dashboard → Edge Functions. You should see all three functions listed.

## Testing Order

1. **Test `stripe-env-check` first**
   ```bash
   curl https://kyjwifumacnrpgyextzz.supabase.co/functions/v1/stripe-env-check
   ```
   It should return a JSON object with `"ok": true` and the environment variable statuses. If it returns `{"code":"NOT_FOUND"}`, the function is not deployed yet.

2. **Do not test Stripe Checkout until `stripe-env-check` works**
   The checkout button in Account & Billing will fail if the Edge Function is missing.

3. **Stripe Webhook URL**
   After deployment, configure Stripe with:
   ```
   https://kyjwifumacnrpgyextzz.functions.supabase.co/stripe-webhook
   ```
   (Note: the `.functions.supabase.co` domain is used for Stripe webhooks, while `.supabase.co/functions/v1/` is used for browser/API calls.)
