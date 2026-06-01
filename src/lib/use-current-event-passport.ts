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
    const { data, error } = await supabase.rpc("get_passport_by_token", {
      _raw_token: stored.access_token,
    });
    const row = (data?.[0] ?? null) as
      | { passport_id?: string | null; event_id?: string | null }
      | null;
    const matchesEvent = row?.event_id ? String(row.event_id) === String(eventId) : true;

    if (error || !row?.passport_id || !matchesEvent) {
      try {
        localStorage.removeItem(savedPassportKey);
      } catch {
        // ignore storage errors
      }
      return {
        ...EMPTY_CURRENT_EVENT_PASSPORT,
        eventId,
        savedPassportKey,
        savedPassportFound: true,
        validationStatus: error ? "error" : "invalid",
        validationError: error?.message ?? (!matchesEvent ? "saved passport belongs to another event" : null),
        staleCleared: true,
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
export function useCurrentEventPassport(): {
  passportHref: string | null;
  hasPassport: boolean;
  validationStatus: PassportValidationStatus;
} {
  const [state, setState] = useState<CurrentEventPassportResult>(EMPTY_CURRENT_EVENT_PASSPORT);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const eventId = await resolveEventIdFromHost();
      if (cancelled) return;
      setState({ ...EMPTY_CURRENT_EVENT_PASSPORT, eventId, validationStatus: "validating" });
      const resolved = await resolveCurrentEventPassport(eventId);
      if (!cancelled) setState(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return {
    passportHref: state.passportHref,
    hasPassport: state.hasPassport,
    validationStatus: state.validationStatus,
  };
}

async function resolveEventIdFromHost(): Promise<string | null> {
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
