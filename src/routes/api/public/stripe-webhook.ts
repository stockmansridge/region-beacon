// Stripe webhook handler for GetStampd subscription lifecycle.
// Lives under /api/public/* so external callers (Stripe) can reach it
// without auth. Signature verification is mandatory.

import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const rawBody = await request.text();

        if (!signature) {
          return new Response("Missing Stripe signature", { status: 400 });
        }

        const { getStripeClient, getWebhookSecret, mapSubscriptionStatus, isPaidPlanCode } =
          await import("@/lib/stripe.server");
        const { getSupabaseAdmin } = await import(
          "@/integrations/supabase/admin.server"
        );

        const stripe = getStripeClient();
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            getWebhookSecret(),
          );
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed", err);
          return new Response("Invalid signature", { status: 400 });
        }

        const admin = getSupabaseAdmin();

        async function applySubscription(sub: Stripe.Subscription, agencyIdHint?: string) {
          const agencyId =
            agencyIdHint ??
            (sub.metadata?.agency_id as string | undefined) ??
            null;
          if (!agencyId) {
            console.error("[stripe-webhook] subscription has no agency_id metadata", sub.id);
            return;
          }
          const planCodeRaw = (sub.metadata?.plan_code as string | undefined) ?? null;
          const planCode = planCodeRaw && isPaidPlanCode(planCodeRaw) ? planCodeRaw : null;
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

          // Persist stripe_customer_id on agency_billing_accounts.
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

          // Stripe SDK v18+ moved current_period_* off Subscription and onto
          // each subscription item. Use the first item as the period source
          // since GetStampd plans are single-line subscriptions.
          const firstItem = sub.items?.data?.[0] as
            | (Stripe.SubscriptionItem & {
                current_period_start?: number;
                current_period_end?: number;
              })
            | undefined;
          const periodStart = firstItem?.current_period_start ?? null;
          const periodEnd = firstItem?.current_period_end ?? null;

          const row = {
            agency_id: agencyId,
            plan_code: planCode,
            status: mapSubscriptionStatus(sub.status),
            stripe_subscription_id: sub.id,
            current_period_start: periodStart
              ? new Date(periodStart * 1000).toISOString()
              : null,
            current_period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            trial_ends_at: sub.trial_end
              ? new Date(sub.trial_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await admin
            .from("agency_subscriptions")
            .select("id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();

          if (existing) {
            await admin.from("agency_subscriptions").update(row).eq("id", existing.id);
          } else {
            await admin.from("agency_subscriptions").insert(row);
          }
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const subId =
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id ?? null;
              const agencyId =
                (session.metadata?.agency_id as string | undefined) ??
                session.client_reference_id ??
                undefined;
              if (subId) {
                const sub = await stripe.subscriptions.retrieve(subId);
                // Propagate metadata from the session in case the
                // subscription itself was created without it.
                if (
                  agencyId &&
                  (!sub.metadata?.agency_id || !sub.metadata?.plan_code)
                ) {
                  await stripe.subscriptions.update(subId, {
                    metadata: {
                      agency_id: agencyId,
                      plan_code:
                        (session.metadata?.plan_code as string | undefined) ??
                        sub.metadata?.plan_code ??
                        "",
                    },
                  });
                  sub.metadata = {
                    ...(sub.metadata ?? {}),
                    agency_id: agencyId,
                    plan_code:
                      (session.metadata?.plan_code as string | undefined) ??
                      sub.metadata?.plan_code ??
                      "",
                  };
                }
                await applySubscription(sub, agencyId);
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              await applySubscription(sub);
              break;
            }
            default:
              // Ignore other events.
              break;
          }
        } catch (err) {
          console.error("[stripe-webhook] handler failed", event.type, err);
          return new Response("Webhook handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
