// Hook: optional custom menu item for the public event menu.
//
// Returns the configured label + URL only when the organiser has enabled the
// toggle on the Branding tab. Browser-only; uses the public anon client and
// degrades to "no custom item" whenever the RPC or columns are unavailable.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

export type EventCustomLink = { label: string; url: string } | null;

export function useEventCustomLink(
  subdomain: string | null | undefined,
): EventCustomLink {
  const [link, setLink] = useState<EventCustomLink>(null);

  useEffect(() => {
    if (!subdomain) {
      setLink(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_public_event_custom_link", {
          _hostname: tenantHost(subdomain),
        });
        if (cancelled) return;
        const row = (data?.[0] ?? null) as {
          custom_link_label?: string | null;
          custom_link_url?: string | null;
          custom_link_enabled?: boolean | null;
        } | null;
        const label = (row?.custom_link_label ?? "").trim();
        const url = (row?.custom_link_url ?? "").trim();
        if (!row?.custom_link_enabled || !label || !url) {
          setLink(null);
          return;
        }
        setLink({ label: label.slice(0, 16), url });
      } catch {
        if (!cancelled) setLink(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  return link;
}
