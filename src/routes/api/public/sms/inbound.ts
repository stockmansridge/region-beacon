import { createFileRoute } from "@tanstack/react-router";

/**
 * ClickSend inbound SMS (STOP / unsubscribe). Public endpoint verified by a
 * shared secret in the ?token= query string.
 * Configure in ClickSend as:
 *   https://getstampd.com.au/api/public/sms/inbound?token=<SMS_WEBHOOK_TOKEN>
 */
export const Route = createFileRoute("/api/public/sms/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"];

async function handle(request: Request): Promise<Response> {
  const { readServerEnv } = await import("@/lib/server-env.server");
  const expected = readServerEnv("SMS_WEBHOOK_TOKEN");
  const url = new URL(request.url);
  if (!expected || (url.searchParams.get("token") ?? "") !== expected) {
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

  const from = String(payload["from"] ?? payload["originalsenderid"] ?? payload["sender"] ?? "");
  const body = String(payload["body"] ?? payload["message"] ?? payload["text"] ?? "");
  const messageId = String(payload["message_id"] ?? payload["messageid"] ?? "") || null;

  const first = body.trim().toLowerCase().split(/\s+/)[0] ?? "";
  const isStop = STOP_WORDS.includes(first.replace(/[^a-z-]/g, ""));
  if (!from || !isStop) return new Response("ok");

  const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("sms_apply_opt_out", {
    _phone_e164: from,
    _reason: "Inbound STOP",
    _provider_message_id: messageId,
  });
  if (error) {
    console.error("[sms-inbound] opt-out failed", error.message);
    return new Response("error", { status: 500 });
  }
  console.log(`[sms-inbound] opt-out applied rows=${String(data)}`);
  return new Response("ok");
}
