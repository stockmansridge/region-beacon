// Lightweight branding resolver for public pages that don't already
// fetch the full event row. Fetches `palette_key` + `page_background_key`
// from public.get_public_event_by_domain(_hostname).
//
// Pages that already fetch the event row should read those fields
// directly and feed them to <EventPaletteScope> instead of using this
// hook.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

export type EventBrandingKeys = {
  paletteKey: string | null;
  backgroundKey: string | null;
};

export function useEventBrandingKeys(
  subdomain: string | null | undefined,
): EventBrandingKeys {
  const [keys, setKeys] = useState<EventBrandingKeys>({
    paletteKey: null,
    backgroundKey: null,
  });
  useEffect(() => {
    if (!subdomain) {
      setKeys({ paletteKey: null, backgroundKey: null });
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
        const row = (data?.[0] ?? null) as {
          palette_key?: string | null;
          page_background_key?: string | null;
        } | null;
        setKeys({
          paletteKey: row?.palette_key ?? null,
          backgroundKey: row?.page_background_key ?? null,
        });
      } catch {
        if (!cancelled) setKeys({ paletteKey: null, backgroundKey: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return keys;
}

/** Backwards-compatible thin wrapper. Prefer useEventBrandingKeys. */
export function useEventPaletteKey(
  subdomain: string | null | undefined,
): string | null {
  return useEventBrandingKeys(subdomain).paletteKey;
}
