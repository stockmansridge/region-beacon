// Hook: determine whether to show the public Map nav item for an event.
//
// Returns true when either:
//   - at least one active venue has lat/lng coordinates, OR
//   - the event has an uploaded site map (event_map_path).
//
// Browser-only; uses the public anon Supabase client.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

export function useEventHasMap(subdomain: string | null | undefined): {
  loading: boolean;
  hasMap: boolean;
} {
  const [state, setState] = useState<{ loading: boolean; hasMap: boolean }>({
    loading: true,
    hasMap: true, // optimistic: show until we know otherwise, avoids flash-hide
  });

  useEffect(() => {
    if (!subdomain) {
      setState({ loading: false, hasMap: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const [{ data: venueData }, { data: evtData }] = await Promise.all([
        supabase.rpc("get_public_venues_by_domain", { _hostname: host }),
        supabase.rpc("get_public_event_by_domain", { _hostname: host }),
      ]);
      if (cancelled) return;
      const venues = (venueData ?? []) as Array<{
        lat: number | string | null;
        lng: number | string | null;
        event_found: boolean | null;
      }>;
      const hasGeoVenue = venues.some((v) => {
        if (v.event_found === false) return false;
        const lat = v.lat == null ? NaN : Number(v.lat as unknown as string);
        const lng = v.lng == null ? NaN : Number(v.lng as unknown as string);
        return (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          !(lat === 0 && lng === 0)
        );
      });
      const evt = (evtData?.[0] ?? null) as {
        event_map_path?: string | null;
      } | null;
      const hasUploaded = Boolean(evt?.event_map_path);
      setState({ loading: false, hasMap: hasGeoVenue || hasUploaded });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  return state;
}
