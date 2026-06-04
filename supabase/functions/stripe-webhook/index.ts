import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type StoredStatus = "active" | "trialing" | "past_due" | "cancelled" | "incomplete" | "paused";

function mapSubscriptionStatus(status: Stripe.Subscription.Status): StoredStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "paused":
      return "paused";
    case "incomplete":
    case "incomplete_expired":
    default:
      return "incomplete";
  }
}

function isPaidPlanCode(code: string | null | undefined): code is "starter" | "growth" | "regional" | "pro_region" {
  return code === "starter" || code === "growth" || code === "regional" || code === "pro_region";
}

function getEnv(name: string): string | null {
  return Deno.env.get(name) || null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
  const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
    console.error("[stripe-webhook] missing server configuration");
    return new Response("Server configuration error", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function applySubscription(sub: Stripe.Subscription, agencyIdHint?: string | null) {
    const agencyId = agencyIdHint ?? sub.metadata?.agency_id ?? null;
    if (!agencyId) {
      console.error("[stripe-webhook] subscription has no agency_id metadata", { subscription_id: sub.id });
      return;
    }

    const planCodeRaw = sub.metadata?.plan_code ?? null;
    const planCode = isPaidPlanCode(planCodeRaw) ? planCodeRaw : null;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

    if (customerId) {
      const { data: existingAcct } = await admin
        .from("agency_billing_accounts")
        .select("id, stripe_customer_id")
        .eq("agency_id", agencyId)
        .maybeSingle();
      if (existingAcct) {
        if (existingAcct.stripe_customer_id !== customerId) {
          await admin
            .from("agency_billing_accounts")
            .update({ stripe_customer_id: customerId })
            .eq("id", existingAcct.id);
        }
      } else {
        await admin.from("agency_billing_accounts").insert({
          agency_id: agencyId,
          stripe_customer_id: customerId,
        });
      }
    }

    const firstItem = sub.items?.data?.[0] as
      | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
      | undefined;
    const periodStart = firstItem?.current_period_start ?? null;
    const periodEnd = firstItem?.current_period_end ?? null;

    const row = {
      agency_id: agencyId,
      plan_code: planCode,
      status: mapSubscriptionStatus(sub.status),
      stripe_subscription_id: sub.id,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from("agency_subscriptions")
      .select("id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();

    const { error } = existing
      ? await admin.from("agency_subscriptions").update(row).eq("id", existing.id)
      : await admin.from("agency_subscriptions").insert(row);
    if (error) {
      throw new Error(error.message);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        const agencyId = session.metadata?.agency_id ?? session.client_reference_id ?? null;
        if (subId) {
          let sub = await stripe.subscriptions.retrieve(subId);
          if (agencyId && (!sub.metadata?.agency_id || !sub.metadata?.plan_code)) {
            sub = await stripe.subscriptions.update(subId, {
              metadata: {
                agency_id: agencyId,
                plan_code: session.metadata?.plan_code ?? sub.metadata?.plan_code ?? "",
              },
            });
          }
          await applySubscription(sub, agencyId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler failed", {
      event_type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Webhook handler error", { status: 500 });
  }

  return Response.json({ received: true });
});
