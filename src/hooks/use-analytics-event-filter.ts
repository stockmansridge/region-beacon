import { useCallback, useEffect, useState } from "react";

const storageKey = (agencyId: string) => `gs.analytics.event.${agencyId}`;

/** Browser-only UI preference, not visitor data or an access-control decision. */
export function useAnalyticsEventFilter(agencyId: string | null) {
  const [selection, setSelection] = useState<{ agencyId: string | null; eventId: string }>({ agencyId: null, eventId: "all" });

  useEffect(() => {
    let eventId = "all";
    if (agencyId) {
      try {
        eventId = window.localStorage.getItem(storageKey(agencyId)) || "all";
      } catch {
        // Blocked browser storage must not prevent using Analytics.
      }
    }
    setSelection({ agencyId, eventId });
  }, [agencyId]);

  const chooseEvent = useCallback((eventId: string) => {
    if (!agencyId) return;
    setSelection({ agencyId, eventId });
    try {
      window.localStorage.setItem(storageKey(agencyId), eventId);
    } catch {
      // Keep this page's selection usable even when it cannot be remembered.
    }
  }, [agencyId]);

  return [selection.agencyId === agencyId ? selection.eventId : "all", chooseEvent] as const;
}