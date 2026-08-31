import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "gs_pv_device";
const SEEN_KEY = "gs_pv_seen";
/** Re-count the same path for the same device after 30 minutes. */
const REPEAT_MS = 30 * 60 * 1000;

function deviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  } catch {
    return null;
  }
}

function shouldRecord(key: string): boolean {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const seen = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    if (seen[key] && now - seen[key] < REPEAT_MS) return false;
    seen[key] = now;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    return true;
  } catch {
    return true;
  }
}

/**
 * Records an anonymous page view for a public event page.
 *
 * Fires once per path per device per 30 minutes. Fails silently when the
 * `record_event_page_view` RPC is not yet deployed.
 */
export function usePageViewTracking(eventId?: string | null, path?: string) {
  useEffect(() => {
    if (!eventId) return;
    if (typeof window === "undefined") return;
    const p = (path ?? window.location.pathname) || "/";
    const device = deviceId();
    if (!device) return;
    if (!shouldRecord(`${eventId}:${p}`)) return;
    void supabase
      .rpc("record_event_page_view", {
        _event_id: eventId,
        _path: p,
        _device_id: device,
      })
      .then(() => undefined, () => undefined);
  }, [eventId, path]);
}
