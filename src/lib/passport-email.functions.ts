import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ token: z.string().min(8).max(200) });

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(params: { firstName: string; eventName: string; passportUrl: string }): string {
  const { firstName, eventName, passportUrl } = params;
  const greetingName = firstName?.trim() ? esc(firstName.trim()) : "there";
  const evt = esc(eventName);
  const url = esc(passportUrl);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#111827;padding-bottom:16px;">GetStampd</td></tr>
        <tr><td style="font-size:16px;line-height:24px;color:#111827;padding-bottom:12px;">Hi ${greetingName},</td></tr>
        <tr><td style="font-size:16px;line-height:24px;color:#334155;padding-bottom:24px;">Here's the link to your passport for <strong>${evt}</strong>. Bookmark this email so you can always find your way back to collect stamps and view prizes.</td></tr>
        <tr><td align="center" style="padding-bottom:20px;">
          <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">Open my passport</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:20px;color:#64748B;padding-bottom:24px;word-break:break-all;">Or open this link in your browser:<br/><a href="${url}" style="color:#334155;">${url}</a></td></tr>
        <tr><td style="font-size:12px;line-height:18px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:16px;">You're receiving this because you signed up for ${evt} on GetStampd.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Sends the passport link to the visitor's email after signup.
 * Best-effort: never throws — signup already succeeded before this runs.
 * Looks up email/name/event via the service-role client from the token so
 * the caller cannot inject arbitrary recipients.
 */
export const sendPassportEmail = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => inputSchema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const lovableKey = process.env.LOVABLE_API_KEY;
      const resendKey = process.env.RESEND_API_KEY;
      if (!lovableKey || !resendKey) {
        console.warn("[passport-email] missing gateway keys; skipping send");
        return { sent: false, reason: "not_configured" as const };
      }
      const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
      const supabaseAdmin = getSupabaseAdmin();
      const { data: rows, error } = await supabaseAdmin.rpc("get_passport_by_token", {
        _raw_token: data.token,
      });
      if (error) {
        console.error("[passport-email] get_passport_by_token failed", error.message);
        return { sent: false, reason: "lookup_failed" as const };
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.email || !row?.event_id) {
        return { sent: false, reason: "not_found" as const };
      }
      const email = String(row.email);
      const firstName = (row.first_name as string | null) ?? "";
      const eventId = String(row.event_id);

      const { data: evt, error: evtErr } = await supabaseAdmin
        .from("events")
        .select("name")
        .eq("id", eventId)
        .maybeSingle();
      if (evtErr || !evt?.name) {
        console.error("[passport-email] event lookup failed", evtErr?.message);
        return { sent: false, reason: "event_lookup_failed" as const };
      }
      const eventName = String(evt.name);

      // Resolve the event's active public subdomain (if any) for the passport URL.
      let subdomain: string | null = null;
      const { data: dom } = await supabaseAdmin
        .from("event_domains")
        .select("public_subdomain, status")
        .eq("event_id", eventId)
        .eq("status", "active")
        .maybeSingle();
      if (dom?.public_subdomain) subdomain = String(dom.public_subdomain);

      const passportUrl = subdomain
        ? `https://${subdomain}.getstampd.com.au/passport/${data.token}`
        : `https://getstampd.com.au/passport/${data.token}`;

      const html = buildHtml({ firstName, eventName, passportUrl });

      const response = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: "GetStampd <passports@getstampd.com.au>",
          to: [email],
          subject: `Your passport for ${eventName}`,
          html,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`[passport-email] resend failed [${response.status}]: ${body}`);
        return { sent: false, reason: "send_failed" as const, status: response.status };
      }
      return { sent: true as const };
    } catch (err) {
      console.error("[passport-email] unexpected error", err);
      return { sent: false, reason: "exception" as const };
    }
  });
