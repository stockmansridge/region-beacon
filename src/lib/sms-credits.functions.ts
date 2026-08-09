import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const checkoutInput = z.object({
  access_token: z.string().min(20).max(4000),
  agency_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  origin: z.string().url(),
  return_path: z.string().max(200).optional(),
});

/**
 * Creates a one-off Stripe Checkout session for a prepaid SMS credit pack.
 * The pack price is re-read server-side; credits are only granted later by
 * the Stripe webhook.
 */
export const createSmsCreditCheckout = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => checkoutInput.parse(raw))
  .handler(async ({ data }) => {
    const { createSmsCreditCheckoutSession } = await import("@/lib/sms-credits.server");
    try {
      return await createSmsCreditCheckoutSession({
        accessToken: data.access_token,
        agencyId: data.agency_id,
        packId: data.pack_id,
        origin: data.origin,
        returnPath: data.return_path ?? "/admin/communications",
      });
    } catch (err) {
      console.error("[sms-credit-checkout] failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false as const,
        error: "Could not open Stripe Checkout. Please try again.",
      };
    }
  });
