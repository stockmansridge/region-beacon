import { resolveCurrentEventPassport } from "@/lib/use-current-event-passport";

export type StalePassportResolution = "invalid_cleared" | "kept";

/**
 * Authoritative readback after redeem_checkin reports passport_not_found /
 * passport_event_mismatch. The server error alone is NOT proof the saved
 * credential is dead (business-rule mismatches and transient failures can
 * carry the same message), so we re-validate the saved token through
 * get_passport_by_token:
 *
 * - "invalid_cleared": the token is conclusively invalid or belongs to
 *   another event. resolveCurrentEventPassport has already removed it via
 *   clearStoredPassportIfToken, which only clears when storage still holds
 *   the exact rejected token — a concurrent fresh login is preserved.
 * - "kept": the token validated for this event, or the readback failed
 *   (transport/server/malformed). The credential stays; the visitor gets a
 *   recoverable scan error instead of losing their passport.
 */
export async function resolveStaleSavedPassport(
  eventId: string | null | undefined,
): Promise<StalePassportResolution> {
  if (!eventId) return "kept";
  const resolved = await resolveCurrentEventPassport(eventId);
  return resolved.validationStatus === "invalid" ? "invalid_cleared" : "kept";
}
