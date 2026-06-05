import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

export type PublicFaqEntry = {
  question: string;
  answer: string;
  order_index: number;
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; entries: PublicFaqEntry[] }
  | { kind: "error" };

/**
 * Public-safe FAQ entries for the current event host. Returns an empty list
 * when the event is not live or has no entries — callers should hide UI
 * surfaces when `entries.length === 0`.
 */
export function useEventFaqByDomain(subdomain: string | null | undefined): State {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!subdomain) {
      setState({ kind: "ok", entries: [] });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      const host = tenantHost(subdomain);
      const { data, error } = await supabase.rpc(
        "get_public_event_faq_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      if (error) {
        setState({ kind: "error" });
        return;
      }
      const rows = (data ?? []) as PublicFaqEntry[];
      setState({ kind: "ok", entries: rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  return state;
}
