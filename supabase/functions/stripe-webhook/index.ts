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
  const testWebhookSecret = getEnv("STRIPE_TEST_WEBHOOK_SECRET");
  const testStripeSecretKey = getEnv("STRIPE_TEST_SECRET_KEY");
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

  const liveStripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const testStripe = testStripeSecretKey
    ? new Stripe(testStripeSecretKey, {
        apiVersion: "2024-04-10",
        httpClient: Stripe.createFetchHttpClient(),
      })
    : null;

  const rawBody = await req.text();

  // Two Stripe environments, two signing secrets. Each candidate secret is
  // verified with full signature checking — never relaxed, never shared. The
  // secret that verifies decides the payment environment.
  let verified: Stripe.Event | null = null;
  let paymentEnvironment: "live" | "test" = "live";
  try {
    verified = await liveStripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    paymentEnvironment = "live";
  } catch (liveErr) {
    if (!testWebhookSecret) {
      console.error("[stripe-webhook] signature verification failed", {
        error: liveErr instanceof Error ? liveErr.message : String(liveErr),
      });
      return new Response("Invalid signature", { status: 400 });
    }
    try {
      const verifier = testStripe ?? liveStripe;
      verified = await verifier.webhooks.constructEventAsync(rawBody, signature, testWebhookSecret);
      paymentEnvironment = "test";
    } catch (testErr) {
      console.error("[stripe-webhook] signature verification failed (live and test)", {
        live_error: liveErr instanceof Error ? liveErr.message : String(liveErr),
        test_error: testErr instanceof Error ? testErr.message : String(testErr),
      });
      return new Response("Invalid signature", { status: 400 });
    }
  }
  if (!verified) return new Response("Invalid signature", { status: 400 });
  const event: Stripe.Event = verified;

  // Cross-check the verified secret against Stripe's own livemode flag.
  const expectedLive = paymentEnvironment === "live";
  if (typeof event.livemode === "boolean" && event.livemode !== expectedLive) {
    console.error("[stripe-webhook] livemode/secret mismatch", {
      event_id: event.id,
      livemode: event.livemode,
      resolved_environment: paymentEnvironment,
    });
    return new Response("Environment mismatch", { status: 400 });
  }

  const stripe = paymentEnvironment === "test" && testStripe ? testStripe : liveStripe;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function applySubscription(sub: Stripe.Subscription, agencyIdHint?: string | null) {
    // Subscription billing is a LIVE-only concern. Sandbox subscription
    // events must never touch production subscription records.
    if (paymentEnvironment !== "live") {
      console.log("[stripe-webhook] ignoring test-mode subscription event", {
        subscription_id: sub.id,
      });
      return;
    }
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

  // --- Prepaid SMS credits (one-off payments) ------------------------------
  // Idempotent by design: sms_stripe_events guards on the Stripe event id and
  // sms_credit_purchase_apply() guards on the checkout session / payment
  // intent id. A replayed webhook is a no-op, never a double credit.
  async function applySmsCreditPurchase(params: {
    eventId: string;
    eventType: string;
    metadata: Record<string, string> | null | undefined;
    agencyIdHint: string | null;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    amountPaidCents: number | null;
    currency: string | null;
  }) {
    const meta = params.metadata ?? {};
    if (meta["purchase_type"] !== "sms_credits") return;

    const agencyId = meta["agency_id"] ?? params.agencyIdHint;
    const credits = Number(meta["credits"] ?? "0");
    const packId = meta["sms_credit_pack_id"] ?? null;
    if (!agencyId || !Number.isFinite(credits) || credits <= 0) {
      console.error("[stripe-webhook] sms_credits payload incomplete", {
        event_id: params.eventId,
        agency_id: agencyId,
        credits: meta["credits"],
      });
      return;
    }

    // Event-level replay guard.
    const { error: guardErr } = await admin.from("sms_stripe_events").insert({
      stripe_event_id: params.eventId,
      event_type: params.eventType,
      agency_id: agencyId,
      payload_summary: {
        ...meta,
        stripe_checkout_session_id: params.checkoutSessionId,
        stripe_payment_intent_id: params.paymentIntentId,
        amount_paid_cents: params.amountPaidCents,
        currency: params.currency,
      },
    });
    if (guardErr) {
      // 23505 = unique violation -> already handled.
      if ((guardErr as { code?: string }).code === "23505") {
        console.log("[stripe-webhook] sms_credits event already processed", {
          event_id: params.eventId,
        });
        return;
      }
      throw new Error(guardErr.message);
    }

    const { data, error } = await admin.rpc("sms_credit_purchase_apply", {
      _agency_id: agencyId,
      _credits: credits,
      _amount_paid_cents: params.amountPaidCents,
      _currency: params.currency ?? "AUD",
      _stripe_checkout_session_id: params.checkoutSessionId,
      _stripe_payment_intent_id: params.paymentIntentId,
      _pack_id: packId,
      _description: `SMS credit purchase (${credits} credits)`,
    });
    if (error) {
      throw new Error(error.message);
    }
    console.log("[stripe-webhook] sms credits applied", {
      agency_id: agencyId,
      credits,
      result: data,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const agencyId = session.metadata?.agency_id ?? session.client_reference_id ?? null;

        // One-off SMS credit pack purchase.
        if (session.metadata?.purchase_type === "sms_credits") {
          if (session.payment_status !== "paid") {
            console.log("[stripe-webhook] sms_credits session not paid yet", {
              session_id: session.id,
              payment_status: session.payment_status,
            });
            break;
          }
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          await applySmsCreditPurchase({
            eventId: event.id,
            eventType: event.type,
            metadata: session.metadata as Record<string, string>,
            agencyIdHint: agencyId,
            checkoutSessionId: session.id,
            paymentIntentId: piId,
            amountPaidCents: session.amount_total ?? null,
            currency: session.currency ? session.currency.toUpperCase() : "AUD",
          });
          break;
        }

        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

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
      case "payment_intent.succeeded": {
        // Safety net for one-off SMS credit payments if the checkout session
        // event is missed. Idempotency makes the overlap harmless.
        const pi = event.data.object as Stripe.PaymentIntent;
        await applySmsCreditPurchase({
          eventId: event.id,
          eventType: event.type,
          metadata: pi.metadata as Record<string, string>,
          agencyIdHint: pi.metadata?.agency_id ?? null,
          checkoutSessionId: null,
          paymentIntentId: pi.id,
          amountPaidCents: pi.amount_received ?? pi.amount ?? null,
          currency: pi.currency ? pi.currency.toUpperCase() : "AUD",
        });
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
