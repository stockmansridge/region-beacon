import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { type PublicMapHours } from "@/lib/map-opening-hours";

/** Bounded, public cached-data reads; the clock never triggers a fetch. */
export function useMapOpeningHours(subdomain: string, venueIds: string[], enabled: boolean) {
  const [result, setResult] = useState<{ scope: string; rows: Record<string, PublicMapHours>; loading: boolean; failed: boolean } | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const scope = JSON.stringify([subdomain, venueIds]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const rows: Record<string, PublicMapHours> = {};
    let index = 0;
    let failed = false;
    setResult({ scope, rows: {}, loading: true, failed: false });
    setNow(new Date());
    async function worker() {
      while (!cancelled && index < venueIds.length) {
        const id = venueIds[index++];
        try {
          const response = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: PublicMapHours[] | null; error: unknown }>)(
            "get_public_venue_hours", { _hostname: tenantHost(subdomain), _venue_id: id },
          );
          if (response.error) failed = true;
          else if (response.data?.[0]) rows[id] = response.data[0];
        } catch { failed = true; }
      }
    }
    void Promise.all(Array.from({ length: Math.min(6, venueIds.length) }, worker)).then(() => {
      if (!cancelled) setResult({ scope, rows, loading: false, failed });
    });
    return () => { cancelled = true; };
  }, [scope, enabled]); // scope includes the complete venue list and tenant

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [enabled]);
  return { rows: result?.scope === scope ? result.rows : {}, loading: enabled && (result?.scope !== scope || result.loading), failed: result?.scope === scope && result.failed, now };
}