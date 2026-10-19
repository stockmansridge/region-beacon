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

/** Read and remove the pending destination for this event (event-scoped key wins). */
export function consumeReturnTo(eventId: string | null | undefined): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    if (eventId) {
      const scopedKey = `gs.returnTo.${eventId}`;
      const scoped = sessionStorage.getItem(scopedKey);
      if (scoped) {
        sessionStorage.removeItem(scopedKey);
        return scoped;
      }
    }
    const pending = sessionStorage.getItem("gs.returnTo.pending");
    if (pending) sessionStorage.removeItem("gs.returnTo.pending");
    return pending;
  } catch {
    return null;
  }
}
