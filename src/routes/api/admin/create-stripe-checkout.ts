import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import type Stripe from "stripe";

type PaidPlanCode = "starter" | "growth" | "regional" | "pro_region";

type CheckoutResponse = { ok: true; url: string } | { ok: false; error: string };

const PAID_PLAN_CODES = new Set<string>(["starter", "growth", "regional", "pro_region"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: CheckoutResponse, status = 200) {
  return Response.json(body, { status });
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function logErr(stage: string, message: string, extra?: Record<string, unknown>) {
  console.error(`[stripe-checkout-api] ${stage}: ${message}`, extra ?? {});
}

export const Route = createFileRoute("/api/admin/create-stripe-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
       try {
        let body: { agency_id?: unknown; plan_code?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, error: "Invalid JSON body." }, 400);
        }

        const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
        const planCode = typeof body.plan_code === "string" ? body.plan_code : "";
        if (!agencyId || !planCode) {
          return jsonResponse({ ok: false, error: "Missing agency_id or plan_code." }, 400);
        }
        if (!UUID_RE.test(agencyId)) {
          return jsonResponse({ ok: false, error: "Invalid agency_id." }, 400);
        }
        if (!PAID_PLAN_CODES.has(planCode)) {
          return jsonResponse({ ok: false, error: "Invalid paid plan." }, 400);
        }

        const accessToken = getBearerToken(request);
        if (!accessToken) {
          return jsonResponse(
            { ok: false, error: "Not signed in. Please sign in and try again." },
            401,
          );
        }

        const env = process.env;
        const priceEnvName = `STRIPE_PRICE_${planCode.toUpperCase()}`;
        const missingEnv: string[] = [];
        if (!env.STRIPE_SECRET_KEY) missingEnv.push("STRIPE_SECRET_KEY");
        if (!env.GETSTAMPD_SUPABASE_URL) missingEnv.push("GETSTAMPD_SUPABASE_URL");
        if (!env.GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY) {
          missingEnv.push("GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY");
        }
        if (!env.GETSTAMPD_SUPABASE_PUBLISHABLE_KEY) {
          missingEnv.push("GETSTAMPD_SUPABASE_PUBLISHABLE_KEY");
        }
        if (!env[priceEnvName]) missingEnv.push(priceEnvName);

        if (missingEnv.length > 0) {
          logErr("config", "missing environment variables", { missing: missingEnv });
          return jsonResponse({
            ok: false,
            error: `Server is missing configuration: ${missingEnv.join(", ")}. Set these in Lovable Cloud secrets and republish.`,
          });
        }

        const { getStripeClient, getPriceIdForPlan } = await import("@/lib/stripe.server");
        const { getSupabaseAdmin, getSupabaseAsUser } =
          await import("@/integrations/supabase/admin.server");

        let userId: string;
        let userEmail: string | null;
        try {
          const asUser = getSupabaseAsUser(accessToken);
          const { data: userRes, error: userErr } = await asUser.auth.getUser();
          if (userErr || !userRes?.user) {
            logErr("auth", "getUser failed", { error: userErr?.message });
            return jsonResponse(
              { ok: false, error: "Not signed in. Please sign in and try again." },
              401,
            );
          }
          userId = userRes.user.id;
          userEmail = userRes.user.email ?? null;
        } catch (err) {
          logErr("auth", "Supabase user client failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          return jsonResponse({
            ok: false,
            error: "Could not verify your sign-in session. Please try again.",
          });
        }

        const admin = getSupabaseAdmin();
        const [{ data: roles, error: rolesErr }, { data: members, error: membersErr }] =
          await Promise.all([
            admin.from("user_roles").select("role").eq("user_id", userId),
            admin
              .from("agency_members")
              .select("role, accepted_at")
              .eq("user_id", userId)
              .eq("agency_id", agencyId),
          ]);

        if (rolesErr || membersErr) {
          logErr("permission", "lookup failed", {
            roles_error: rolesErr?.message,
            members_error: membersErr?.message,
          });
          return jsonResponse({
            ok: false,
            error: "Could not verify your permissions. Please try again.",
          });
        }

        const isPlatformAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
        const isAgencyAdmin = (members ?? []).some(
          (m) => m.accepted_at != null && (m.role === "agency_owner" || m.role === "agency_admin"),
        );
        if (!isPlatformAdmin && !isAgencyAdmin) {
          logErr("permission", "user lacks owner/admin role for agency", {
            user_id: userId,
            agency_id: agencyId,
          });
          return jsonResponse(
            {
              ok: false,
              error: "You don't have permission to manage billing for this organisation.",
            },
            403,
          );
        }

        const stripe = getStripeClient();
        const { data: billingAccount, error: billingErr } = await admin
          .from("agency_billing_accounts")
          .select("id, stripe_customer_id, billing_email")
          .eq("agency_id", agencyId)
          .maybeSingle();
        if (billingErr) {
          logErr("billing", "billing account lookup failed", { error: billingErr.message });
          return jsonResponse({
            ok: false,
            error: "Could not load billing account details. Please try again.",
          });
        }

        let stripeCustomerId = billingAccount?.stripe_customer_id ?? null;
        if (!stripeCustomerId) {
          try {
            const customer = await stripe.customers.create({
              email: billingAccount?.billing_email ?? userEmail ?? undefined,
              metadata: { agency_id: agencyId },
            });
            stripeCustomerId = customer.id;
          } catch (err) {
            logErr("stripe", "customer create failed", {
              error_type: err instanceof Error ? err.name : typeof err,
            });
            return jsonResponse({
              ok: false,
              error: "Stripe customer create failed. Check Stripe configuration and try again.",
            });
          }

          const { error: saveCustomerErr } = billingAccount
            ? await admin
                .from("agency_billing_accounts")
                .update({ stripe_customer_id: stripeCustomerId })
                .eq("id", billingAccount.id)
            : await admin.from("agency_billing_accounts").insert({
                agency_id: agencyId,
                stripe_customer_id: stripeCustomerId,
                billing_email: userEmail,
              });
          if (saveCustomerErr) {
            logErr("billing", "stripe customer save failed", {
              error: saveCustomerErr.message,
            });
            return jsonResponse({
              ok: false,
              error: "Could not save Stripe customer details. Please try again.",
            });
          }
        }

        if (!stripeCustomerId) {
          logErr("stripe", "customer id unavailable after create/reuse");
          return jsonResponse({
            ok: false,
            error: "Could not prepare Stripe customer details. Please try again.",
          });
        }

        let priceId: string;
        try {
          priceId = getPriceIdForPlan(planCode as PaidPlanCode);
        } catch (err) {
          logErr("config", "price id missing", {
            plan: planCode,
            error: err instanceof Error ? err.message : String(err),
          });
          return jsonResponse({
            ok: false,
            error: err instanceof Error ? err.message : "Stripe price not configured.",
          });
        }

        try {
          const price = await stripe.prices.retrieve(priceId);
          if (!price.active) {
            logErr("stripe", "price is not active", { plan: planCode });
            return jsonResponse({
              ok: false,
              error: `Stripe price for ${planCode} is inactive. Update the price in Stripe or change the price ID secret.`,
            });
          }
          if (price.type !== "recurring") {
            logErr("stripe", "price is not recurring", {
              plan: planCode,
              type: price.type,
            });
            return jsonResponse({
              ok: false,
              error: `Stripe price for ${planCode} is not a recurring (subscription) price. Use a subscription price ID.`,
            });
          }
        } catch (err) {
          logErr("stripe", "price retrieve failed", {
            plan: planCode,
            error_type: err instanceof Error ? err.name : typeof err,
          });
          return jsonResponse({
            ok: false,
            error: `Stripe could not load the ${planCode} price. Check that ${priceEnvName} matches your STRIPE_SECRET_KEY mode (test vs live).`,
          });
        }

        try {
          const origin = getOrigin(request);
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/admin/account?checkout=success`,
            cancel_url: `${origin}/admin/account?checkout=cancelled`,
            client_reference_id: agencyId,
            metadata: {
              agency_id: agencyId,
              plan_code: planCode,
              user_id: userId,
            },
            subscription_data: {
              metadata: {
                agency_id: agencyId,
                plan_code: planCode,
              },
            },
            allow_promotion_codes: true,
          } satisfies Stripe.Checkout.SessionCreateParams);
          if (!session.url) {
            logErr("stripe", "checkout session returned no url");
            return jsonResponse({ ok: false, error: "Stripe did not return a checkout URL." });
          }
          return jsonResponse({ ok: true, url: session.url });
        } catch (err) {
          logErr("stripe", "checkout create failed", {
            error_type: err instanceof Error ? err.name : typeof err,
          });
          return jsonResponse({
            ok: false,
            error: "Stripe Checkout create failed. Check Stripe configuration and try again.",
          });
        }
       } catch (err) {
         console.error("[stripe-checkout-api] unhandled", {
           error: err instanceof Error ? err.message : String(err),
           stack: err instanceof Error ? err.stack : undefined,
         });
         return jsonResponse(
           {
             ok: false,
             error: err instanceof Error
               ? `Unhandled checkout API error: ${err.message}`
               : "Unhandled checkout API error.",
           },
           500,
         );
       }
      },
    },
  },
});
