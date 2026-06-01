// Lightweight palette resolver for public pages that don't already fetch
// the full event row. Fetches `palette_key` from
// public.get_public_event_by_domain(_hostname) and returns it (nullable).
//
// Pages that already fetch the event should read `palette_key` directly
// and feed it to <EventPaletteScope> instead of using this hook.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

export function useEventPaletteKey(subdomain: string | null | undefined): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (!subdomain) {
      setKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const host = tenantHost(subdomain);
        const { data } = await supabase.rpc("get_public_event_by_domain", {
          _hostname: host,
        });
        if (cancelled) return;
        const row = (data?.[0] ?? null) as { palette_key?: string | null } | null;
        setKey(row?.palette_key ?? null);
      } catch {
        if (!cancelled) setKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return key;
}
