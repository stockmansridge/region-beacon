import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sendInput = z.object({
  access_token: z.string().min(20).max(4000),
  agency_id: z.string().uuid(),
  event_id: z.string().uuid(),
  message: z.string().min(1).max(1600),
  encoding: z.enum(["GSM-7", "UCS-2"]),
  segments_per_recipient: z.number().int().min(1).max(10),
  audience_kind: z.enum(["all_opted_in", "checked_in", "not_checked_in", "venue_visited"]),
  audience_params: z.record(z.string(), z.string()).optional(),
  name: z.string().max(200).optional(),
});

/**
 * Reserves credits (as the signed-in user, so RLS + membership apply) and then
 * dispatches the campaign to ClickSend with the service-role client.
 */
export const sendSmsCampaign = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => sendInput.parse(raw))
  .handler(async ({ data }) => {
    const { sendCampaign } = await import("@/lib/sms/send.server");
    try {
      return await sendCampaign({
        accessToken: data.access_token,
        agencyId: data.agency_id,
        eventId: data.event_id,
        message: data.message,
        encoding: data.encoding,
        segmentsPerRecipient: data.segments_per_recipient,
        audienceKind: data.audience_kind,
        audienceParams: data.audience_params ?? {},
        name: data.name ?? null,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[sms-send] failed", { error: detail });
      return { ok: false as const, error: `Could not send this SMS: ${detail}` };
    }
  });

/** Reports whether the SMS provider is configured in this runtime (no values). */
export const getSmsProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readServerEnv } = await import("@/lib/server-env.server");
  const sender = readServerEnv("CLICKSEND_SENDER") ?? null;
  return {
    configured: Boolean(
      readServerEnv("CLICKSEND_USERNAME") && readServerEnv("CLICKSEND_API_KEY") && sender,
    ),
    has_username: Boolean(readServerEnv("CLICKSEND_USERNAME")),
    has_api_key: Boolean(readServerEnv("CLICKSEND_API_KEY")),
    sender,
    inbound_webhook_configured: Boolean(readServerEnv("SMS_WEBHOOK_TOKEN")),
  };
});
