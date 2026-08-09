// ClickSend provider adapter. Server-only: never import from a component.
//
// Credentials are read per request through readServerEnv so the same code
// works on Lovable-hosted SSR and on the Cloudflare Worker.

import { readServerEnv } from "@/lib/server-env.server";

const CLICKSEND_BASE = "https://rest.clicksend.com/v3";

export type ClickSendConfig = {
  username: string;
  apiKey: string;
  sender: string;
};

export type SmsSendResult = {
  to: string;
  ok: boolean;
  providerMessageId: string | null;
  status: string;
  error: string | null;
};

export function getClickSendConfig(): ClickSendConfig | null {
  const username = readServerEnv("CLICKSEND_USERNAME");
  const apiKey = readServerEnv("CLICKSEND_API_KEY");
  const sender = readServerEnv("CLICKSEND_SENDER");
  if (!username || !apiKey || !sender) return null;
  return { username, apiKey, sender };
}

/** Canonical AU E.164 normalisation. Mirrors sms_normalise_au_mobile() in SQL. */
export function normaliseAuMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }
  if (digits.startsWith("614") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.startsWith("4") && digits.length === 9) return `+61${digits}`;
  return null;
}

type ClickSendMessage = {
  body: string;
  to: string;
  from: string;
  custom_string: string;
  source: string;
};

type ClickSendResponse = {
  http_code?: number;
  response_code?: string;
  response_msg?: string;
  data?: {
    messages?: Array<{
      to?: string;
      status?: string;
      message_id?: string;
      custom_string?: string;
      error_text?: string;
      message_parts?: number;
    }>;
  };
};

/**
 * Sends up to 1000 messages in one ClickSend call. Returns one result per
 * requested recipient so the caller can mark each row individually.
 */
export async function sendSmsBatch(
  config: ClickSendConfig,
  messages: Array<{ to: string; body: string; reference: string }>,
): Promise<SmsSendResult[]> {
  if (messages.length === 0) return [];

  const payload: { messages: ClickSendMessage[] } = {
    messages: messages.map((m) => ({
      body: m.body,
      to: m.to,
      from: config.sender,
      custom_string: m.reference,
      source: "getstampd",
    })),
  };

  const auth = btoa(`${config.username}:${config.apiKey}`);
  const response = await fetch(`${CLICKSEND_BASE}/sms/send`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[clicksend] send failed [${response.status}]: ${text}`);
    return messages.map((m) => ({
      to: m.to,
      ok: false,
      providerMessageId: null,
      status: "rejected",
      error: `ClickSend ${response.status}: ${text.slice(0, 300)}`,
    }));
  }

  let parsed: ClickSendResponse = {};
  try {
    parsed = JSON.parse(text) as ClickSendResponse;
  } catch {
    // Unexpected non-JSON success body; treat as submitted without ids.
  }

  const rows = parsed.data?.messages ?? [];
  return messages.map((m, index) => {
    const row =
      rows.find((r) => r.custom_string === m.reference) ??
      rows.find((r) => normaliseAuMobile(r.to ?? "") === m.to) ??
      rows[index];
    const status = (row?.status ?? "").toUpperCase();
    const ok = status === "SUCCESS" || status === "QUEUED";
    return {
      to: m.to,
      ok,
      providerMessageId: row?.message_id ?? null,
      status: ok ? "submitted" : "rejected",
      error: ok ? null : (row?.error_text ?? row?.status ?? "Provider rejected the message"),
    };
  });
}

/** Maps a ClickSend delivery-receipt status onto our recipient status values. */
export function mapDeliveryStatus(providerStatus: string): "delivered" | "failed" | "submitted" {
  const s = (providerStatus || "").toLowerCase();
  if (s.includes("deliver") && !s.includes("undeliver") && !s.includes("not")) return "delivered";
  if (
    s.includes("fail") ||
    s.includes("undeliver") ||
    s.includes("error") ||
    s.includes("reject") ||
    s.includes("expire") ||
    s.includes("cancel")
  ) {
    return "failed";
  }
  return "submitted";
}
