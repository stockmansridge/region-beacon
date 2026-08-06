// Hook: customer-facing venue/location wording for an event, resolved from
// the public RPC so shared chrome (nav, drawer, tabs) can use the same
// terminology as the page bodies.
//
// Browser-only; uses the public anon Supabase client. Falls back to
// Venue / Venues whenever the event or the columns are unavailable.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import {
  resolveVenueLabels,
  type VenueLabels,
  DEFAULT_VENUE_LABEL_SINGULAR,
  DEFAULT_VENUE_LABEL_PLURAL,
} from "@/lib/venue-labels";

const FALLBACK: VenueLabels = {
  singular: DEFAULT_VENUE_LABEL_SINGULAR,
  plural: DEFAULT_VENUE_LABEL_PLURAL,
};

export function useEventVenueLabels(
  subdomain: string | null | undefined,
): VenueLabels {
  const [labels, setLabels] = useState<VenueLabels>(FALLBACK);

  useEffect(() => {
    if (!subdomain) {
      setLabels(FALLBACK);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_public_event_by_domain", {
          _hostname: tenantHost(subdomain),
        });
        if (cancelled) return;
        const row = (data?.[0] ?? null) as {
          venue_label_singular?: string | null;
          venue_label_plural?: string | null;
        } | null;
        setLabels(resolveVenueLabels(row));
      } catch {
        if (!cancelled) setLabels(FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  return labels;
}
