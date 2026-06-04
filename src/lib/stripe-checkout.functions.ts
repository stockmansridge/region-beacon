import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// GetStampd Stripe Checkout server function. Creates a Stripe Checkout
// Session for a paid plan upgrade. The client redirects the browser to the
// returned URL. Subscription activation happens server-side via the
// /api/public/stripe-webhook route — this function never updates billing
// state directly.

const InputSchema = z.object({
  agency_id: z.string().uuid(),
  plan_code: z.enum(["starter", "growth", "regional", "pro_region"]),
  access_token: z.string().min(10),
  origin: z.string().url(),
});

export const createStripeCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { getStripeClient, getPriceIdForPlan } = await import("./stripe.server");
    const { getSupabaseAdmin, getSupabaseAsUser } = await import(
      "@/integrations/supabase/admin.server"
    );

    // 1. Verify caller identity.
    const asUser = getSupabaseAsUser(data.access_token);
    const { data: userRes, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return { ok: false as const, error: "Not signed in. Please sign in and try again." };
    }
    const userId = userRes.user.id;
    const userEmail = userRes.user.email ?? null;

    // 2. Verify agency membership (owner/admin) or platform admin.
    const admin = getSupabaseAdmin();
    const [{ data: roles }, { data: members }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin
        .from("agency_members")
        .select("role, accepted_at")
        .eq("user_id", userId)
        .eq("agency_id", data.agency_id),
    ]);
    const isPlatformAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
    const isAgencyAdmin = (members ?? []).some(
      (m) =>
        m.accepted_at != null &&
        (m.role === "agency_owner" || m.role === "agency_admin"),
    );
    if (!isPlatformAdmin && !isAgencyAdmin) {
      return {
        ok: false as const,
        error: "You don't have permission to manage billing for this organisation.",
      };
    }

    // 3. Resolve / create Stripe customer (stored on agency_billing_accounts).
    const stripe = getStripeClient();
    const { data: billingAccount } = await admin
      .from("agency_billing_accounts")
      .select("id, stripe_customer_id, billing_email")
      .eq("agency_id", data.agency_id)
      .maybeSingle();

    let stripeCustomerId = billingAccount?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: billingAccount?.billing_email ?? userEmail ?? undefined,
        metadata: { agency_id: data.agency_id },
      });
      stripeCustomerId = customer.id;
      if (billingAccount) {
        await admin
          .from("agency_billing_accounts")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", billingAccount.id);
      } else {
        await admin.from("agency_billing_accounts").insert({
          agency_id: data.agency_id,
          stripe_customer_id: stripeCustomerId,
          billing_email: userEmail,
        });
      }
    }

    // 4. Create Checkout Session.
    let priceId: string;
    try {
      priceId = getPriceIdForPlan(data.plan_code);
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Stripe price not configured.",
      };
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${data.origin}/admin/account?checkout=success`,
        cancel_url: `${data.origin}/admin/account?checkout=cancelled`,
        client_reference_id: data.agency_id,
        metadata: {
          agency_id: data.agency_id,
          plan_code: data.plan_code,
          user_id: userId,
        },
        subscription_data: {
          metadata: {
            agency_id: data.agency_id,
            plan_code: data.plan_code,
          },
        },
        allow_promotion_codes: true,
      });
      if (!session.url) {
        return { ok: false as const, error: "Stripe did not return a checkout URL." };
      }
      return { ok: true as const, url: session.url };
    } catch (err) {
      console.error("[stripe-checkout] create session failed", err);
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : "Could not create Stripe checkout session.",
      };
    }
  });
