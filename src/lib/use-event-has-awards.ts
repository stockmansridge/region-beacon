import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { hasActiveAwards } from "@/lib/event-awards";

/**
 * True when the current public event has at least one active award.
 * Used by the public nav to hide the Awards entry when nothing is live.
 */
export function useEventHasAwards(subdomain: string | null | undefined): {
  hasAwards: boolean;
  eventId: string | null;
} {
  const [eventId, setEventId] = useState<string | null>(null);
  const [hasAwards, setHasAwards] = useState(false);

  useEffect(() => {
    if (!subdomain) {
      setEventId(null);
      setHasAwards(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const host = tenantHost(subdomain);
        const { data } = await supabase.rpc("get_public_event_by_domain", {
          _hostname: host,
        });
        const row = (data?.[0] ?? null) as { event_id?: string | null } | null;
        const id = row?.event_id ?? null;
        if (cancelled) return;
        setEventId(id);
        if (!id) {
          setHasAwards(false);
          return;
        }
        const has = await hasActiveAwards(id);
        if (!cancelled) setHasAwards(has);
      } catch {
        if (!cancelled) setHasAwards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  return { hasAwards, eventId };
}
