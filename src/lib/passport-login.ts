import { supabase } from "@/integrations/supabase/client";
import { canPersistLocally } from "@/lib/storage-check";
import { resolveCurrentEventPassport } from "@/lib/use-current-event-passport";

/** Re-save the reopened passport on this device so the visitor is not asked to log in again. */
function persistPassport(eventId: string, token: string): void {
  try {
    if (!canPersistLocally()) return;
    window.localStorage.setItem(
      `gs.passport.${eventId}`,
      JSON.stringify({ access_token: token, saved_at: new Date().toISOString() }),
    );
  } catch {
    // Storage blocked — the passport still opens; the visitor can log in by email again.
  }
}

export type PassportLoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "notfound" | "unavailable" };

/**
 * Owner-approved flow: the Join page "Log in" button opens the passport
 * directly from the email address — no emailed link or code is sent.
 * Runs in the browser through the same public connection the sign-up form
 * uses, so it does not depend on a private server key being configured.
 *
 * Multi-device behaviour: the RPC issues a NEW device token that resolves to
 * the SAME passport; it never rotates or replaces the original passport key,
 * so existing devices and emailed links keep working. If this browser already
 * holds a valid saved passport for the event AND it belongs to the same email
 * being entered, that token is reused instead of minting another alias, so
 * rapid repeated logins on one device stay bounded. A saved passport for a
 * DIFFERENT email is never reused — on a shared device, entering person B's
 * email must open person B's passport, not person A's.
 * The RPC is rate limited per event+email in the database.
 */
export async function loginWithPassportEmail(eventId: string, rawEmail: string): Promise<PassportLoginResult> {
  const email = rawEmail.trim().toLowerCase();

  // Same-device fast path: a valid remembered passport for the SAME email
  // needs no new token. If the saved row carries no email we cannot prove
  // ownership, so we fall through to the authoritative email lookup.
  try {
    const existing = await resolveCurrentEventPassport(eventId);
    if (
      existing.validationStatus === "valid" &&
      existing.token &&
      existing.email &&
      existing.email.trim().toLowerCase() === email
    ) {
      return { ok: true, token: existing.token };
    }
  } catch {
    // Fall through to the email lookup; a failed local check must not block login.
  }

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
    persistPassport(eventId, row.access_token);
    return { ok: true, token: row.access_token };
  } catch {
    console.error("[passport-login] lookup unavailable");
    return { ok: false, reason: "unavailable" };
  }
}
