// Server-only helpers for prepaid SMS credit purchases.
//
// Nothing in this file grants credits. Crediting happens ONLY in the
// Stripe webhook (supabase/functions/stripe-webhook) via the
// sms_credit_purchase_apply() RPC, which is idempotent.
//
// Live vs test: the payment environment is resolved HERE, server-side, from
// the platform-admin SMS payment mode plus the caller's platform-admin
// status. The browser can never supply or influence it.

import { getStripeClientFor, type StripePaymentEnvironment } from "@/lib/stripe.server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/integrations/supabase/admin.server";

export type SmsCheckoutResult =
  | { ok: true; url: string; payment_environment: StripePaymentEnvironment }
  | { ok: false; error: string };

type PackRow = {
  id: string;
  code: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string | null;
  stripe_price_id: string | null;
};

/** Resolves the caller and confirms they may buy credits for this organisation. */
async function authorisePurchaser(accessToken: string, agencyId: string) {
  const asUser = getSupabaseAsUser(accessToken);
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes?.user) {
    return { ok: false as const, error: "Not signed in. Please sign in and try again." };
  }
  const userId = userRes.user.id;
  const email = userRes.user.email ?? null;

  const admin = getSupabaseAdmin();
  const [rolesRes, membersRes] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId),
    admin
      .from("agency_members")
      .select("role, accepted_at")
      .eq("user_id", userId)
      .eq("agency_id", agencyId),
  ]);
  if (rolesRes.error || membersRes.error) {
    return { ok: false as const, error: "Could not verify your permissions. Please try again." };
  }

  const isPlatformAdmin = (rolesRes.data ?? []).some((r) => r.role === "platform_admin");
  const isAgencyAdmin = (membersRes.data ?? []).some(
    (m) =>
      m.accepted_at != null && (m.role === "agency_owner" || m.role === "agency_admin"),
  );
  if (!isPlatformAdmin && !isAgencyAdmin) {
    return {
      ok: false as const,
      error: "You don't have permission to buy SMS credits for this organisation.",
    };
  }
  return { ok: true as const, userId, email, isPlatformAdmin };
}

/**
 * Sandbox checkout is only ever reachable when BOTH hold:
 *   1. the caller is a platform admin (verified server-side above), and
 *   2. SMS payment mode is set to "test" by a platform admin.
 * Everyone else always gets the live Stripe environment.
 */
async function resolvePaymentEnvironment(
  isPlatformAdmin: boolean,
): Promise<StripePaymentEnvironment> {
  if (!isPlatformAdmin) return "live";
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("sms_provider_settings")
    .select("sms_payment_mode")
    .eq("id", true)
    .maybeSingle();
  if (error) return "live";
  return (data?.sms_payment_mode as string | undefined) === "test" ? "test" : "live";
}

/** Reuses (or creates) the organisation's LIVE Stripe customer record. */
async function ensureStripeCustomer(
  agencyId: string,
  fallbackEmail: string | null,
): Promise<string> {
  const admin = getSupabaseAdmin();
  const stripe = getStripeClientFor("live");

  const { data: account, error } = await admin
    .from("agency_billing_accounts")
    .select("id, stripe_customer_id, billing_email")
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error) throw new Error("Could not load billing account details.");

  if (account?.stripe_customer_id) return account.stripe_customer_id as string;

  const customer = await stripe.customers.create({
    email: (account?.billing_email as string | null) ?? fallbackEmail ?? undefined,
    metadata: { agency_id: agencyId },
  });

  const saveRes = account
    ? await admin
        .from("agency_billing_accounts")
        .update({ stripe_customer_id: customer.id })
        .eq("id", account.id)
    : await admin.from("agency_billing_accounts").insert({
        agency_id: agencyId,
        stripe_customer_id: customer.id,
        billing_email: fallbackEmail,
      });
  if (saveRes.error) throw new Error("Could not save Stripe customer details.");

  return customer.id;
}

export async function createSmsCreditCheckoutSession(input: {
  accessToken: string;
  agencyId: string;
  packId: string;
  origin: string;
  returnPath: string;
}): Promise<SmsCheckoutResult> {
  const auth = await authorisePurchaser(input.accessToken, input.agencyId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const env = await resolvePaymentEnvironment(auth.isPlatformAdmin);

  const admin = getSupabaseAdmin();
  // Server-side price: the browser never supplies an amount.
  const { data: pack, error: packErr } = await admin
    .from("sms_credit_packs")
    .select("id, code, name, credits, price_cents, currency, stripe_price_id")
    .eq("id", input.packId)
    .eq("active", true)
    .maybeSingle();
  if (packErr) return { ok: false, error: "Could not load the SMS credit pack." };
  if (!pack) return { ok: false, error: "That SMS credit pack is not available." };

  const p = pack as PackRow;
  const stripe = getStripeClientFor(env);
  const isTest = env === "test";

  // Live customer records don't exist in Sandbox, so test checkouts identify
  // the buyer by email only. Live behaviour is unchanged.
  const customerId = isTest ? null : await ensureStripeCustomer(input.agencyId, auth.email);

  const metadata: Record<string, string> = {
    purchase_type: "sms_credits",
    payment_environment: env,
    agency_id: input.agencyId,
    sms_credit_pack_id: p.id,
    sms_credit_pack_code: p.code,
    credits: String(p.credits),
    user_id: auth.userId,
  };

  const returnPath = input.returnPath.startsWith("/")
    ? input.returnPath
    : "/admin/communications";

  const productName = isTest
    ? `${p.name} — GetStampd SMS (TEST)`
    : `${p.name} — GetStampd SMS`;
  const productDescription = `${Number(p.credits).toLocaleString("en-AU")} prepaid SMS credits${
    isTest ? " (Stripe Sandbox test purchase — no monetary value)" : ""
  }`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(customerId ? { customer: customerId } : {}),
    ...(isTest && auth.email ? { customer_email: auth.email } : {}),
    line_items: [
      // Live price ids don't exist in Sandbox, so test sessions always use
      // inline price_data built from the same server-side pack row.
      !isTest && p.stripe_price_id
        ? { price: p.stripe_price_id, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: (p.currency ?? "AUD").toLowerCase(),
              unit_amount: p.price_cents,
              product_data: {
                name: productName,
                description: productDescription,
              },
            },
          },
    ],
    success_url: `${input.origin}${returnPath}?checkout=success`,
    cancel_url: `${input.origin}${returnPath}?checkout=cancelled`,
    client_reference_id: input.agencyId,
    metadata,
    payment_intent_data: { metadata },
  });

  if (!session.url) return { ok: false, error: "Stripe did not return a checkout URL." };
  return { ok: true, url: session.url, payment_environment: env };
}

