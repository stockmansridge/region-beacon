import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Owner-approved flow: the Join page "Log in" button opens the passport
 * directly from the email address — no emailed link or code is sent.
 * The RPC rotates the passport key, so earlier links on other devices stop
 * working (same trade-off as re-registering). Returns the same neutral
 * result when the email is not registered or the lookup is rate limited.
 */
export const loginWithPassportEmail = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => schema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
      const { data: rows, error } = await getSupabaseAdmin().rpc("lookup_passport_by_email" as never, {
        _event_id: data.eventId,
        _email: data.email,
      } as never);
      if (error) {
        console.error("[passport-login] lookup failed", error.message);
        return { ok: false as const };
      }
      const row = (Array.isArray(rows) ? rows[0] : rows) as { access_token: string } | undefined;
      if (!row?.access_token) return { ok: false as const };
      return { ok: true as const, token: row.access_token };
    } catch (err) {
      console.error("[passport-login] lookup unexpected", err);
      return { ok: false as const };
    }
  });
