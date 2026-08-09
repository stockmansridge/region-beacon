import { createFileRoute } from "@tanstack/react-router";

/**
 * ClickSend delivery receipts. Public endpoint verified by a shared secret in
 * the ?token= query string (ClickSend cannot sign requests).
 * Configure in ClickSend as:
 *   https://getstampd.com.au/api/public/sms/delivery?token=<SMS_WEBHOOK_TOKEN>
 */
export const Route = createFileRoute("/api/public/sms/delivery")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const { readServerEnv } = await import("@/lib/server-env.server");
  const expected = readServerEnv("SMS_WEBHOOK_TOKEN");
  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? "";
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw) {
      payload = raw.trim().startsWith("{")
        ? (JSON.parse(raw) as Record<string, unknown>)
        : Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    payload = {};
  }
  for (const [k, v] of url.searchParams) if (k !== "token") payload[k] = v;

  const messageId = String(payload["message_id"] ?? payload["messageid"] ?? "");
  const providerStatus = String(payload["status"] ?? payload["delivery_status"] ?? "");
  if (!messageId) return new Response("ok");

  const { mapDeliveryStatus } = await import("@/lib/sms/clicksend.server");
  const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
  const status = mapDeliveryStatus(providerStatus);
  if (status === "submitted") return new Response("ok");

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("sms_campaign_recipients")
    .update({
      status,
      failure_reason: status === "failed" ? providerStatus.slice(0, 300) : null,
    })
    .eq("provider_message_id", messageId);
  if (error) {
    console.error("[sms-delivery] update failed", error.message);
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
}
