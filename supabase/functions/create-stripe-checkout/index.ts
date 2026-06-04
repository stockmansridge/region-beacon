import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PaidPlanCode = "starter" | "growth" | "regional" | "pro_region";

const PAID_PLAN_CODES = new Set<string>(["starter", "growth", "regional", "pro_region"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE_ENV_BY_PLAN: Record<PaidPlanCode, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  regional: "STRIPE_PRICE_REGIONAL",
  pro_region: "STRIPE_PRICE_PRO_REGION",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function getEnv(name: string): string | null {
  return Deno.env.get(name) || null;
}

function getOrigin(req: Request, bodyOrigin: unknown): string {
  if (typeof bodyOrigin === "string" && /^https?:\/\//i.test(bodyOrigin)) return bodyOrigin;
  const origin = req.headers.get("origin");
  if (origin) return origin;
  return new URL(req.url).origin;
}

function mapMissing(names: string[]) {
  return names.filter((name) => !getEnv(name));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ ok: false, error: "Not signed in. Please sign in and try again." }, 401);
    }

    let body: { agency_id?: unknown; plan_code?: unknown; origin?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    const planCode = typeof body.plan_code === "string" ? body.plan_code : "";
    if (!agencyId || !planCode) {
      return json({ ok: false, error: "Missing agency_id or plan_code." }, 400);
    }
    if (!UUID_RE.test(agencyId)) {
      return json({ ok: false, error: "Invalid agency_id." }, 400);
    }
    if (!PAID_PLAN_CODES.has(planCode)) {
      return json({ ok: false, error: "Invalid paid plan." }, 400);
    }

    const priceEnvName = PRICE_ENV_BY_PLAN[planCode as PaidPlanCode];
    const missing = mapMissing([
      "STRIPE_SECRET_KEY",
      priceEnvName,
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    if (missing.length > 0) {
      console.error("[create-stripe-checkout] missing env", { missing });
      return json({ ok: false, error: `Server is missing configuration: ${missing.join(", ")}.` }, 500);
    }

    const supabaseUrl = getEnv("SUPABASE_URL")!;
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY")!;
    const priceId = getEnv(priceEnvName)!;
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const asUser = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userRes, error: userErr } = await asUser.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      console.error("[create-stripe-checkout] getUser failed", { error: userErr?.message });
      return json({ ok: false, error: "Not signed in. Please sign in and try again." }, 401);
    }

    const userId = userRes.user.id;
    const userEmail = userRes.user.email ?? null;
    const [{ data: roles, error: rolesErr }, { data: members, error: membersErr }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin
        .from("agency_members")
        .select("role, accepted_at")
        .eq("user_id", userId)
        .eq("agency_id", agencyId),
    ]);

    if (rolesErr || membersErr) {
      console.error("[create-stripe-checkout] permission lookup failed", {
        roles_error: rolesErr?.message,
        members_error: membersErr?.message,
      });
      return json({ ok: false, error: "Could not verify your permissions. Please try again." }, 403);
    }

    const isPlatformAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
    const isAgencyAdmin = (members ?? []).some(
      (m) => m.accepted_at != null && (m.role === "agency_owner" || m.role === "agency_admin"),
    );
    if (!isPlatformAdmin && !isAgencyAdmin) {
      return json({ ok: false, error: "You don't have permission to manage billing for this organisation." }, 403);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });

    const { data: billingAccount, error: billingErr } = await admin
      .from("agency_billing_accounts")
      .select("id, stripe_customer_id, billing_email")
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (billingErr) {
      console.error("[create-stripe-checkout] billing account lookup failed", { error: billingErr.message });
      return json({ ok: false, error: "Could not load billing account details. Please try again." }, 500);
    }

    let stripeCustomerId = billingAccount?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: billingAccount?.billing_email ?? userEmail ?? undefined,
        metadata: { agency_id: agencyId },
      });
      stripeCustomerId = customer.id;

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
        console.error("[create-stripe-checkout] customer save failed", { error: saveCustomerErr.message });
        return json({ ok: false, error: "Could not save Stripe customer details. Please try again." }, 500);
      }
    }

    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.type !== "recurring") {
      return json({ ok: false, error: `Stripe price for ${planCode} must be an active recurring price.` }, 500);
    }

    const origin = getOrigin(req, body.origin);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/admin/account?checkout=success`,
      cancel_url: `${origin}/admin/account?checkout=cancelled`,
      client_reference_id: agencyId,
      metadata: { agency_id: agencyId, plan_code: planCode, user_id: userId },
      subscription_data: { metadata: { agency_id: agencyId, plan_code: planCode } },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return json({ ok: false, error: "Stripe did not return a checkout URL." }, 500);
    }
    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[create-stripe-checkout] unhandled", {
      error: err instanceof Error ? err.message : String(err),
    });
    return json({ ok: false, error: "Stripe Checkout failed. Check Stripe configuration and try again." }, 500);
  }
});
