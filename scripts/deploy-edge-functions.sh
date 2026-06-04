#!/usr/bin/env bash
set -euo pipefail

# GetStampd Edge Functions Deploy Script
# Deploys Supabase Edge Functions for Stripe integration

PROJECT_REF="kyjwifumacnrpgyextzz"

# 1. Check Supabase CLI
echo "=== Checking Supabase CLI ==="
if ! command -v supabase &> /dev/null; then
    echo "ERROR: Supabase CLI is not installed."
    echo "Install it: https://supabase.com/docs/guides/cli/getting-started"
    exit 1
fi
supabase --version

# 2. Confirm target project
echo ""
echo "=== Target Project ==="
echo "Project ref: $PROJECT_REF"

# 3. Link project
echo ""
echo "=== Linking Project ==="
supabase link --project-ref "$PROJECT_REF"

# 4. Deploy functions
echo ""
echo "=== Deploying Edge Functions ==="
supabase functions deploy stripe-env-check --project-ref "$PROJECT_REF"
supabase functions deploy create-stripe-checkout --project-ref "$PROJECT_REF"
supabase functions deploy stripe-webhook --project-ref "$PROJECT_REF"

# 5. Print URLs
echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Test URLs:"
echo "  https://$PROJECT_REF.supabase.co/functions/v1/stripe-env-check"
echo "  https://$PROJECT_REF.supabase.co/functions/v1/create-stripe-checkout"
echo "  https://$PROJECT_REF.supabase.co/functions/v1/stripe-webhook"
echo ""
echo "Next steps:"
echo "  1. Open Supabase Dashboard → Edge Functions to verify they appear."
echo "  2. Run stripe-env-check first (it should return env status, not NOT_FOUND)."
echo "  3. Only then test Stripe Checkout."
