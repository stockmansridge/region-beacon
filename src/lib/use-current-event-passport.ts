import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StoredPassport = {
  passport_id?: string;
  access_token?: string;
  event_id?: string;
  subdomain?: string;
  created_at?: string;
};

export type PassportValidationStatus =
  | "idle"
  | "missing_event"
  | "missing_saved"
  | "validating"
  | "valid"
  | "invalid"
  | "error";

export type CurrentEventPassportResult = {
  hasPassport: boolean;
  passportHref: string | null;
  token: string | null;
  eventId: string | null;
  passportId: string | null;
  savedPassportKey: string | null;
  savedPassportFound: boolean;
  validationStatus: PassportValidationStatus;
  validationError: string | null;
  staleCleared: boolean;
};

export const EMPTY_CURRENT_EVENT_PASSPORT: CurrentEventPassportResult = {
  hasPassport: false,
  passportHref: null,
  token: null,
  eventId: null,
  passportId: null,
  savedPassportKey: null,
  savedPassportFound: false,
  validationStatus: "idle",
  validationError: null,
  staleCleared: false,
};

export function readStoredPassportForEvent(eventId: string): StoredPassport | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`gs.passport.${eventId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPassport;
    if (!parsed?.access_token) return null;
    return { ...parsed, event_id: parsed.event_id ?? eventId };
  } catch {
    return null;
  }
}

export type PassportLookupOutcome = "valid" | "invalid" | "unknown";

/**
 * Classify a get_passport_by_token response. Only a successful response with
 * zero rows (or a row lacking a passport id) is conclusive proof the token is
 * invalid/replaced. Any error, thrown failure or malformed payload is
 * "unknown" and must never cause the saved passport to be deleted.
 */
export function classifyPassportLookup(res: {
  data?: unknown;
  error?: unknown;
} | null | undefined): PassportLookupOutcome {
  if (!res || res.error) return "unknown";
  if (!Array.isArray(res.data)) return res.data == null ? "unknown" : "unknown";
  const row = res.data[0] as { passport_id?: string | null } | undefined;
  if (res.data.length === 0) return "invalid";
  return row?.passport_id ? "valid" : "invalid";
}

/**
 * Remove gs.passport.<eventId> only if it still holds the exact token that the
 * backend rejected. Protects a newer passport saved by a concurrent
 * re-registration (or another tab) from being wiped by a stale check.
 */
export function clearStoredPassportIfToken(eventId: string, rejectedToken: string): boolean {
  if (typeof localStorage === "undefined" || !eventId || !rejectedToken) return false;
  try {
    const key = `gs.passport.${eventId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredPassport | null;
    if (parsed?.access_token !== rejectedToken) return false;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export async function resolveCurrentEventPassport(
  eventId: string | null | undefined,
): Promise<CurrentEventPassportResult> {
  if (!eventId) {
    return { ...EMPTY_CURRENT_EVENT_PASSPORT, validationStatus: "missing_event" };
  }

  const savedPassportKey = `gs.passport.${eventId}`;
  const stored = readStoredPassportForEvent(eventId);
  if (!stored?.access_token) {
    return {
      ...EMPTY_CURRENT_EVENT_PASSPORT,
      eventId,
      savedPassportKey,
      validationStatus: "missing_saved",
    };
  }

  try {
    const res = await supabase.rpc("get_passport_by_token", {
      _raw_token: stored.access_token,
    });
    const { data, error } = res;
    const outcome = classifyPassportLookup(res);
    const row = (Array.isArray(data) ? data[0] ?? null : null) as
      | { passport_id?: string | null; event_id?: string | null }
      | null;
    const matchesEvent = row?.event_id ? String(row.event_id) === String(eventId) : true;

    if (outcome === "unknown") {
      // Transport/server/permission failure: keep the saved passport.
      return {
        ...EMPTY_CURRENT_EVENT_PASSPORT,
        eventId,
        savedPassportKey,
        savedPassportFound: true,
        validationStatus: "error",
        validationError: error?.message ?? "passport lookup failed",
        staleCleared: false,
      };
    }

    if (outcome === "invalid" || !row?.passport_id || !matchesEvent) {
      const cleared = clearStoredPassportIfToken(eventId, stored.access_token);
      return {
        ...EMPTY_CURRENT_EVENT_PASSPORT,
        eventId,
        savedPassportKey,
        savedPassportFound: true,
        validationStatus: "invalid",
        validationError: !matchesEvent ? "saved passport belongs to another event" : null,
        staleCleared: cleared,
      };
    }

    return {
      hasPassport: true,
      passportHref: `/passport/${stored.access_token}`,
      token: stored.access_token,
      eventId,
      passportId: row.passport_id,
      savedPassportKey,
      savedPassportFound: true,
      validationStatus: "valid",
      validationError: null,
      staleCleared: false,
    };
  } catch (e) {
    return {
      ...EMPTY_CURRENT_EVENT_PASSPORT,
      eventId,
      savedPassportKey,
      savedPassportFound: true,
      validationStatus: "error",
      validationError: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Returns the My Passport URL for the active saved passport on the current
 * tenant host, or null if none is stored. Does not expose the token in any
 * visible label; consumers should only use the returned `passportHref` as
 * an `href` value.
 */
export function useCurrentEventPassport(eventIdOverride?: string | null, enabled = true): {
  passportHref: string | null;
  hasPassport: boolean;
  validationStatus: PassportValidationStatus;
} {
  const [state, setState] = useState<CurrentEventPassportResult>(EMPTY_CURRENT_EVENT_PASSPORT);
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setState(EMPTY_CURRENT_EVENT_PASSPORT);
      return () => { cancelled = true; };
    }
    (async () => {
      const eventId = eventIdOverride ?? (await resolveEventIdFromHost());
      if (cancelled) return;
      setState({ ...EMPTY_CURRENT_EVENT_PASSPORT, eventId, validationStatus: "validating" });
      const resolved = await resolveCurrentEventPassport(eventId);
      if (!cancelled) setState(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventIdOverride, enabled]);
  return {
    passportHref: state.passportHref,
    hasPassport: state.hasPassport,
    validationStatus: state.validationStatus,
  };
}

export async function resolveEventIdFromHost(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data } = await supabase.rpc("resolve_event_by_host", {
      _hostname: window.location.hostname,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return (row as { event_id?: string | null } | null)?.event_id ?? null;
  } catch {
    return null;
  }
}
