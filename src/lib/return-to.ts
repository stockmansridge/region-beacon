/**
 * Pending scan destination stored when a QR entry page needs a passport first.
 * Stored in sessionStorage (per-tab) so a login on this device resumes the
 * intended scan exactly once, without double redeeming.
 */
export function storeReturnTo(path: string, eventId?: string | null, subdomain?: string | null): void {
  if (typeof sessionStorage === "undefined" || !path) return;
  try {
    sessionStorage.setItem("gs.returnTo.pending", path);
    if (eventId) sessionStorage.setItem(`gs.returnTo.${eventId}`, path);
    if (subdomain) sessionStorage.setItem(`gs.returnTo.sub.${subdomain}`, path);
  } catch {
    // Storage blocked — the scan page still works after a manual revisit.
  }
}

/**
 * Read and remove the pending destination for this event (event-scoped key wins).
 * Consumption is exactly-once: consuming the event-scoped entry also removes a
 * matching unscoped `pending` entry so a later email recovery cannot replay the
 * same scan. The unscoped `pending` fallback is only used when no OTHER event
 * has its own scoped pending scan — that fallback exists for the legitimate
 * "QR first, event temporarily unresolved, login once, return to that scan"
 * flow, and must never redirect a visitor into a different event's scan.
 */
export function consumeReturnTo(eventId: string | null | undefined): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    if (eventId) {
      const scopedKey = `gs.returnTo.${eventId}`;
      const scoped = sessionStorage.getItem(scopedKey);
      if (scoped) {
        sessionStorage.removeItem(scopedKey);
        if (sessionStorage.getItem("gs.returnTo.pending") === scoped) {
          sessionStorage.removeItem("gs.returnTo.pending");
        }
        return scoped;
      }
      // No scoped entry for this event. Only trust the unscoped pending entry
      // if no other event has a scoped pending scan — otherwise it belongs to
      // a different event and must not be replayed here.
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (
          key &&
          key.startsWith("gs.returnTo.") &&
          key !== "gs.returnTo.pending" &&
          !key.startsWith("gs.returnTo.sub.")
        ) {
          return null;
        }
      }
    }
    const pending = sessionStorage.getItem("gs.returnTo.pending");
    if (pending) sessionStorage.removeItem("gs.returnTo.pending");
    return pending;
  } catch {
    return null;
  }
}
