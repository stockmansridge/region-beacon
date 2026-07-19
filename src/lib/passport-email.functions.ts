import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ token: z.string().min(8).max(200) });

const scanKindSchema = z.enum(["venue_checkin", "bonus", "tasting", "social"]);
const scanInputSchema = z.object({
  token: z.string().min(8).max(200),
  kind: scanKindSchema,
  points: z.number().int().min(0).max(100000),
  name: z.string().max(200).optional(),
  alreadyCollected: z.boolean().optional(),
});

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
      const gatewayUrl = "https://connector-gateway.lovable.dev/resend";
      const escapeHtml = (s: string): string =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      const buildHtml = (params: { firstName: string; eventName: string; passportUrl: string }): string => {
        const { firstName, eventName, passportUrl } = params;
        const greetingName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
        const evt = escapeHtml(eventName);
        const url = escapeHtml(passportUrl);
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
      };
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

      const response = await fetch(`${gatewayUrl}/emails`, {
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
      const toDomain = email.split("@")[1] ?? "unknown";
      if (!response.ok) {
        const body = await response.text();
        console.error(`[passport-email] resend failed [${response.status}] to=@${toDomain} event=${eventId}: ${body}`);
        return { sent: false, reason: "send_failed" as const, status: response.status };
      }
      let messageId = "unknown";
      try {
        const json = (await response.clone().json()) as { id?: string };
        if (json?.id) messageId = json.id;
      } catch {
        // non-JSON success body; ignore
      }
      console.log(`[passport-email] sent to=@${toDomain} event=${eventId} message_id=${messageId}`);
      return { sent: true as const };
    } catch (err) {
      console.error("[passport-email] unexpected error", err);
      return { sent: false, reason: "exception" as const };
    }
  });

/**
 * Sends a short "you just earned points" confirmation after a scan.
 * Best-effort: never throws. Resolves recipient email/event via service role
 * from the passport token so the caller cannot inject arbitrary recipients.
 */
export const sendScanEmail = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => scanInputSchema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const lovableKey = process.env.LOVABLE_API_KEY;
      const resendKey = process.env.RESEND_API_KEY;
      if (!lovableKey || !resendKey) {
        console.warn("[scan-email] missing gateway keys; skipping send");
        return { sent: false, reason: "not_configured" as const };
      }
      const escapeHtml = (s: string): string =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
      const supabaseAdmin = getSupabaseAdmin();
      const { data: rows, error } = await supabaseAdmin.rpc("get_passport_by_token", {
        _raw_token: data.token,
      });
      if (error) {
        console.error("[scan-email] get_passport_by_token failed", error.message);
        return { sent: false, reason: "lookup_failed" as const };
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.email || !row?.event_id) {
        return { sent: false, reason: "not_found" as const };
      }
      const email = String(row.email);
      const firstName = (row.first_name as string | null) ?? "";
      const eventId = String(row.event_id);

      const { data: evt } = await supabaseAdmin
        .from("events")
        .select("name")
        .eq("id", eventId)
        .maybeSingle();
      const eventName = evt?.name ? String(evt.name) : "your event";

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

      const kindLabels: Record<z.infer<typeof scanKindSchema>, { subject: (n: string) => string; headline: (n: string) => string; verb: string }> = {
        venue_checkin: {
          subject: (n) => `Checked in at ${n}`,
          headline: (n) => `You just checked in at <strong>${n}</strong>.`,
          verb: "checked in",
        },
        bonus: {
          subject: (n) => `Bonus points collected — ${n}`,
          headline: (n) => `You just collected the bonus <strong>${n}</strong>.`,
          verb: "collected a bonus",
        },
        tasting: {
          subject: (n) => `Tasting recorded at ${n}`,
          headline: (n) => `Your tasting at <strong>${n}</strong> is recorded.`,
          verb: "tasted",
        },
        social: {
          subject: (n) => `Social share recorded — ${n}`,
          headline: (n) => `Thanks for sharing <strong>${n}</strong> on socials.`,
          verb: "shared",
        },
      };

      const rawName = (data.name ?? "").trim() || eventName;
      const safeName = escapeHtml(rawName);
      const meta = kindLabels[data.kind];
      const greetingName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
      const url = escapeHtml(passportUrl);
      const pointsLine = data.alreadyCollected
        ? `You've already claimed this one, so your points didn't change.`
        : data.points > 0
          ? `You earned <strong>${data.points}</strong> point${data.points === 1 ? "" : "s"}.`
          : `Your visit was recorded.`;

      const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#111827;padding-bottom:16px;">GetStampd</td></tr>
        <tr><td style="font-size:16px;line-height:24px;color:#111827;padding-bottom:12px;">Hi ${greetingName},</td></tr>
        <tr><td style="font-size:16px;line-height:24px;color:#334155;padding-bottom:8px;">${meta.headline(safeName)}</td></tr>
        <tr><td style="font-size:16px;line-height:24px;color:#334155;padding-bottom:24px;">${pointsLine}</td></tr>
        <tr><td align="center" style="padding-bottom:20px;">
          <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">Open my passport</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:18px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:16px;">You're receiving this because you ${meta.verb} at ${escapeHtml(eventName)} on GetStampd.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: "GetStampd <passports@getstampd.com.au>",
          to: [email],
          subject: meta.subject(rawName),
          html,
        }),
      });
      const toDomain = email.split("@")[1] ?? "unknown";
      if (!response.ok) {
        const body = await response.text();
        console.error(`[scan-email] resend failed [${response.status}] kind=${data.kind} to=@${toDomain} event=${eventId}: ${body}`);
        return { sent: false, reason: "send_failed" as const, status: response.status };
      }
      console.log(`[scan-email] sent kind=${data.kind} to=@${toDomain} event=${eventId}`);
      return { sent: true as const };
    } catch (err) {
      console.error("[scan-email] unexpected error", err);
      return { sent: false, reason: "exception" as const };
    }
  });

