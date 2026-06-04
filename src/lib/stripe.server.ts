// Server-only Stripe helpers for GetStampd.
// The .server.ts suffix prevents Vite from bundling this file into the
// client. Never import this from a component, hook, or .functions.ts
// module that the browser can reach at module scope.

import Stripe from "stripe";
import process from "node:process";

export type PaidPlanCode = "starter" | "growth" | "regional" | "pro_region";

export const PAID_PLAN_CODES: readonly PaidPlanCode[] = [
  "starter",
  "growth",
  "regional",
  "pro_region",
];

export function isPaidPlanCode(code: string): code is PaidPlanCode {
  return (PAID_PLAN_CODES as readonly string[]).includes(code);
}

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in Lovable Cloud secrets.",
    );
  }
  // apiVersion literal differs between SDK upgrades; cast to satisfy TS
  // without pinning. The wire format is stable across minor versions.
  return new Stripe(key, { apiVersion: "2024-09-30.acacia" as never });
}

export function getPriceIdForPlan(plan: PaidPlanCode): string {
  const map: Record<PaidPlanCode, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    regional: process.env.STRIPE_PRICE_REGIONAL,
    pro_region: process.env.STRIPE_PRICE_PRO_REGION,
  };
  const id = map[plan];
  if (!id) {
    throw new Error(
      `No Stripe price configured for plan "${plan}". Set STRIPE_PRICE_${plan.toUpperCase()}.`,
    );
  }
  return id;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET in Lovable Cloud secrets.",
    );
  }
  return secret;
}

// Map a Stripe subscription status to the agency_subscriptions.status enum.
export function mapSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
): "active" | "trialing" | "past_due" | "cancelled" | "incomplete" | "paused" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "paused":
      return "paused";
    default:
      return "incomplete";
  }
}
