// GetStampd pricing rules — single source of truth for venue-led plans
// GetStampd only. No VineTrack references.

export interface PricingPlan {
  code: string;
  name: string;
  price: string;
  venueLimit: number | null; // null = custom / unlimited
  events: string;
  passports: string;
  support: string;
  cta: string;
  recommended?: boolean;
}

export const GETSTAMPD_PLANS: PricingPlan[] = [
  {
    code: "free",
    name: "Free",
    price: "$0",
    venueLimit: 5,
    events: "1 active event",
    passports: "250 passports",
    support: "Self-serve",
    cta: "Start free",
  },
  {
    code: "starter",
    name: "Starter",
    price: "$490/year",
    venueLimit: 10,
    events: "1 active event",
    passports: "1,000 passports/year",
    support: "Self-serve",
    cta: "Upgrade to Starter",
  },
  {
    code: "growth",
    name: "Growth",
    price: "$990/year",
    venueLimit: 25,
    events: "3 active events/year",
    passports: "3,000 passports/year",
    support: "Self-serve",
    cta: "Upgrade to Growth",
    recommended: true,
  },
  {
    code: "regional",
    name: "Regional",
    price: "$1,990/year",
    venueLimit: 50,
    events: "5 active events/year",
    passports: "7,500 passports/year",
    support: "Priority support",
    cta: "Upgrade to Regional",
  },
  {
    code: "pro_region",
    name: "Pro Region",
    price: "$3,490/year",
    venueLimit: 100,
    events: "10 active events/year",
    passports: "15,000 passports/year",
    support: "Priority support",
    cta: "Upgrade to Pro Region",
  },
  {
    code: "enterprise",
    name: "Enterprise",
    price: "Custom",
    venueLimit: null,
    events: "Custom",
    passports: "Custom",
    support: "Dedicated account manager",
    cta: "Talk to us",
  },
];

// Alias for clarity in consumers that expect "pricing plans" naming.
export const GETSTAMPD_PRICING_PLANS = GETSTAMPD_PLANS;

const PLAN_ORDER: string[] = GETSTAMPD_PLANS.map((p) => p.code);

/**
 * Accepts a raw plan code (including legacy dashes) and returns the canonical code.
 * Falls back to 'free' if no plan matches.
 */
export function normalizePlanCode(code: string | null | undefined): string {
  if (!code) return "free";
  const normalized = code.toLowerCase().trim().replace(/-/g, "_");
  const found = GETSTAMPD_PLANS.find((p) => p.code === normalized);
  return found ? found.code : "free";
}

/**
 * Returns the matching plan or Free as the default.
 */
export function getPlanByCode(code: string | null | undefined): PricingPlan {
  const canonical = normalizePlanCode(code);
  return GETSTAMPD_PLANS.find((p) => p.code === canonical) ?? GETSTAMPD_PLANS[0];
}

/**
 * Formats the venue limit for display.
 * null -> "100+ venues"
 * number -> "Up to X venues"
 */
export function formatVenueLimit(limit: number | null): string {
  if (limit === null) return "100+ venues";
  return `Up to ${limit} venues`;
}

/**
 * Returns the next plan in the upgrade ladder.
 * Enterprise and unknown plans return null (no further upgrade).
 */
export function getNextPlanAfter(currentCode: string | null | undefined): PricingPlan | null {
  const canonical = normalizePlanCode(currentCode);
  const idx = PLAN_ORDER.indexOf(canonical);
  if (idx === -1 || idx >= PLAN_ORDER.length - 1) return null;
  const nextCode = PLAN_ORDER[idx + 1];
  return GETSTAMPD_PLANS.find((p) => p.code === nextCode) ?? null;
}

/**
 * Returns the lowest plan that supports the given venue count.
 * If more than 100 venues, returns Enterprise.
 */
export function getNextPlanForVenueCount(venueCount: number): PricingPlan {
  for (const plan of GETSTAMPD_PLANS) {
    if (plan.code === "enterprise") continue; // handled after loop
    if (plan.venueLimit !== null && venueCount <= plan.venueLimit) {
      return plan;
    }
  }
  return GETSTAMPD_PLANS.find((p) => p.code === "enterprise")!;
}

/**
 * Returns a human-readable venue-usage message.
 */
export function getVenueUsageMessage(
  venueCount: number,
  plan: PricingPlan
): string {
  if (plan.code === "enterprise" || plan.venueLimit === null) {
    return `${venueCount} venues used. Enterprise plans have custom venue limits.`;
  }
  const limit = plan.venueLimit;
  const remaining = limit - venueCount;
  if (remaining > 0) {
    return `${venueCount} of ${limit} venues used. ${remaining} venue${remaining === 1 ? "" : "s"} remaining.`;
  }
  const next = getNextPlanAfter(plan.code);
  if (next) {
    return `${venueCount} of ${limit} venues used. Upgrade to ${next.name} to add more venues.`;
  }
  return `${venueCount} of ${limit} venues used.`;
}
