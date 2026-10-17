import { supabase } from "@/integrations/supabase/client";

export type PassportLoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "notfound" | "unavailable" };

/**
 * Owner-approved flow: the Join page "Log in" button opens the passport
 * directly from the email address — no emailed link or code is sent.
 * Runs in the browser through the same public connection the sign-up form
 * uses, so it does not depend on a private server key being configured.
 * The RPC rotates the passport key (earlier links on other devices stop
 * working) and is rate limited per event+email in the database.
 */
export async function loginWithPassportEmail(eventId: string, rawEmail: string): Promise<PassportLoginResult> {
  const email = rawEmail.trim().toLowerCase();
  try {
    const { data: rows, error } = await supabase.rpc("lookup_passport_by_email" as never, {
      _event_id: eventId,
      _email: email,
    } as never);
    if (error) {
      console.error("[passport-login] lookup failed", { code: (error as { code?: string }).code ?? null });
      return { ok: false, reason: "unavailable" };
    }
    const row = (Array.isArray(rows) ? rows[0] : rows) as { access_token?: string } | undefined;
    if (!row?.access_token) return { ok: false, reason: "notfound" };
    return { ok: true, token: row.access_token };
  } catch {
    console.error("[passport-login] lookup unavailable");
    return { ok: false, reason: "unavailable" };
  }
}
