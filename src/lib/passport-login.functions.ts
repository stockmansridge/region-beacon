import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requestSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(254),
});
const redeemSchema = z.object({ code: z.string().regex(/^[a-f0-9]{48}$/) });

/**
 * Emails a single-use login link to a registered visitor. Always returns the
 * same neutral result so callers cannot learn who is registered.
 */
export const requestPassportLoginLink = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => requestSchema.parse(raw))
  .handler(async ({ data }) => {
    const neutral = { ok: true as const };
    try {
      const lovableKey = process.env.LOVABLE_API_KEY;
      const resendKey = process.env.RESEND_API_KEY;
      if (!lovableKey || !resendKey) {
        console.warn("[passport-login] email not configured");
        return neutral;
      }
      const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
      const admin = getSupabaseAdmin();
      const { data: rows, error } = await admin.rpc("issue_passport_login_code" as never, {
        _event_id: data.eventId,
        _email: data.email,
      } as never);
      if (error) {
        console.error("[passport-login] issue failed", error.message);
        return neutral;
      }
      const row = (Array.isArray(rows) ? rows[0] : rows) as
        | { code: string | null; first_name: string | null; rate_limited: boolean }
        | undefined;
      if (!row?.code) return neutral;

      const { data: evt } = await admin.from("events").select("name").eq("id", data.eventId).maybeSingle();
      const eventName = String(evt?.name ?? "your event");
      const { data: dom } = await admin
        .from("event_domains")
        .select("public_subdomain")
        .eq("event_id", data.eventId)
        .eq("status", "active")
        .maybeSingle();
      const host = dom?.public_subdomain ? `${dom.public_subdomain}.getstampd.com.au` : "getstampd.com.au";
      const url = `https://${host}/passport/login/${row.code}`;
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const name = row.first_name?.trim() ? esc(row.first_name.trim()) : "there";
      const html = `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" style="padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;width:100%;background:#fff;border-radius:16px;padding:32px;">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px;">GetStampd</td></tr>
<tr><td style="font-size:16px;line-height:24px;padding-bottom:12px;">Hi ${name},</td></tr>
<tr><td style="font-size:16px;line-height:24px;color:#334155;padding-bottom:24px;">Tap below to log back in to your passport for <strong>${esc(eventName)}</strong>. This link works once and expires in 30 minutes.</td></tr>
<tr><td align="center" style="padding-bottom:20px;"><a href="${esc(url)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px;">Log in to my passport</a></td></tr>
<tr><td style="font-size:12px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:16px;">If you didn't ask for this, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: "GetStampd <passports@getstampd.com.au>",
          to: [data.email],
          subject: `Log in to your passport for ${eventName}`,
          html,
        }),
      });
      if (!res.ok) console.error(`[passport-login] send failed [${res.status}]: ${await res.text()}`);
      return neutral;
    } catch (err) {
      console.error("[passport-login] unexpected", err);
      return neutral;
    }
  });

/** Redeems a single-use login code and returns a fresh passport token. */
export const redeemPassportLoginCode = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => redeemSchema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
      const { data: rows, error } = await getSupabaseAdmin().rpc("redeem_passport_login_code" as never, {
        _code: data.code,
      } as never);
      if (error) {
        console.error("[passport-login] redeem failed", error.message);
        return { ok: false as const, reason: "error" as const };
      }
      const row = (Array.isArray(rows) ? rows[0] : rows) as
        | { event_id: string; access_token: string }
        | undefined;
      if (!row?.access_token) return { ok: false as const, reason: "invalid" as const };
      return { ok: true as const, eventId: row.event_id, token: row.access_token };
    } catch (err) {
      console.error("[passport-login] redeem unexpected", err);
      return { ok: false as const, reason: "error" as const };
    }
  });
