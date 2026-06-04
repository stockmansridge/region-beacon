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

function logErr(stage: string, msg: string, extra?: Record<string, unknown>) {
  // Plain, non-secret server logs to make diagnosis easy without exposing values.
  console.error(`[stripe-checkout] ${stage}: ${msg}`, extra ?? {});
}

export const createStripeCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    // 0. Env presence checks first — surface clear, actionable errors.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {};
    const missingEnv: string[] = [];
    if (!process.env.STRIPE_SECRET_KEY) missingEnv.push("STRIPE_SECRET_KEY");
    if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
      missingEnv.push("SUPABASE_URL");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");
    }
    if (
      !process.env.SUPABASE_PUBLISHABLE_KEY &&
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ) {
      missingEnv.push("SUPABASE_PUBLISHABLE_KEY");
    }
    const priceEnvName = `STRIPE_PRICE_${data.plan_code.toUpperCase()}`;
    if (!process.env[priceEnvName]) missingEnv.push(priceEnvName);

    if (missingEnv.length > 0) {
      logErr("config", "missing environment variables", { missing: missingEnv });
      return {
        ok: false as const,
        error: `Server is missing configuration: ${missingEnv.join(", ")}. Set these in Lovable Cloud secrets and republish.`,
      };
    }

    const { getStripeClient, getPriceIdForPlan } = await import("./stripe.server");
    const { getSupabaseAdmin, getSupabaseAsUser } = await import(
      "@/integrations/supabase/admin.server"
    );

    // 1. Verify caller identity.
    let userId: string;
    let userEmail: string | null;
    try {
      const asUser = getSupabaseAsUser(data.access_token);
      const { data: userRes, error: userErr } = await asUser.auth.getUser();
      if (userErr || !userRes?.user) {
        logErr("auth", "getUser failed", { error: userErr?.message });
        return {
          ok: false as const,
          error: "Not signed in. Please sign in and try again.",
        };
      }
      userId = userRes.user.id;
      userEmail = userRes.user.email ?? null;
    } catch (err) {
      logErr("auth", "supabase client init failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? `Supabase auth init failed: ${err.message}`
            : "Supabase auth init failed.",
      };
    }

    // 2. Verify agency membership (owner/admin) or platform admin.
    const admin = getSupabaseAdmin();
    const [{ data: roles, error: rolesErr }, { data: members, error: membersErr }] =
      await Promise.all([
        admin.from("user_roles").select("role").eq("user_id", userId),
        admin
          .from("agency_members")
          .select("role, accepted_at")
          .eq("user_id", userId)
          .eq("agency_id", data.agency_id),
      ]);
    if (rolesErr || membersErr) {
      logErr("permission", "lookup failed", {
        roles_error: rolesErr?.message,
        members_error: membersErr?.message,
      });
      return {
        ok: false as const,
        error: "Could not verify your permissions. Please try again.",
      };
    }
    const isPlatformAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
    const isAgencyAdmin = (members ?? []).some(
      (m) =>
        m.accepted_at != null &&
        (m.role === "agency_owner" || m.role === "agency_admin"),
    );
    if (!isPlatformAdmin && !isAgencyAdmin) {
      logErr("permission", "user lacks owner/admin role for agency", {
        user_id: userId,
        agency_id: data.agency_id,
      });
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
      try {
        const customer = await stripe.customers.create({
          email: billingAccount?.billing_email ?? userEmail ?? undefined,
          metadata: { agency_id: data.agency_id },
        });
        stripeCustomerId = customer.id;
      } catch (err) {
        logErr("stripe", "customer create failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          ok: false as const,
          error:
            err instanceof Error
              ? `Stripe customer create failed: ${err.message}`
              : "Stripe customer create failed.",
        };
      }
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

    // 4. Resolve price id.
    let priceId: string;
    try {
      priceId = getPriceIdForPlan(data.plan_code);
    } catch (err) {
      logErr("config", "price id missing", {
        plan: data.plan_code,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Stripe price not configured.",
      };
    }

    // 5. Pre-flight: verify the price exists and is recurring (so we catch
    //    "No such price" or mode mismatch before checkout.sessions.create
    //    returns a less specific error).
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price.active) {
        logErr("stripe", "price is not active", { plan: data.plan_code, price_id: priceId });
        return {
          ok: false as const,
          error: `Stripe price for ${data.plan_code} is inactive. Update the price in Stripe or change the price ID secret.`,
        };
      }
      if (price.type !== "recurring") {
        logErr("stripe", "price is not recurring", {
          plan: data.plan_code,
          price_id: priceId,
          type: price.type,
        });
        return {
          ok: false as const,
          error: `Stripe price for ${data.plan_code} is not a recurring (subscription) price. Use a subscription price ID.`,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logErr("stripe", "price retrieve failed", {
        plan: data.plan_code,
        price_id: priceId,
        error: message,
      });
      // Common: "No such price" — usually means the secret key mode (test/live)
      // doesn't match the price's mode, or the ID is wrong.
      return {
        ok: false as const,
        error: `Stripe could not load the ${data.plan_code} price (${priceId}). Check that ${priceEnvName} matches your STRIPE_SECRET_KEY mode (test vs live). Stripe said: ${message}`,
      };
    }

    // 6. Create Checkout Session.
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
        logErr("stripe", "checkout session returned no url");
        return { ok: false as const, error: "Stripe did not return a checkout URL." };
      }
      return { ok: true as const, url: session.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logErr("stripe", "checkout session create failed", { error: message });
      return {
        ok: false as const,
        error: `Stripe checkout session create failed: ${message}`,
      };
    }
  });
