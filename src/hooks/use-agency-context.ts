import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAccess } from "@/hooks/use-admin-access";

export type AgencyOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type AgencyContext = {
  status: "loading" | "ready" | "error" | "no-agency";
  isPlatformAdmin: boolean;
  agencies: AgencyOption[];
  selected: AgencyOption | null;
  /** True when the user has >1 agency and we auto-picked the first. */
  ambiguousSelection: boolean;
  error: string | null;
};

/**
 * Resolves the current admin user's agency context.
 * - Loads accepted agency memberships and joined agency rows.
 * - Auto-selects the first agency. Multiple agencies -> ambiguousSelection=true
 *   until a real agency switcher exists.
 * - platform_admin with no memberships -> status "no-agency".
 */
export function useAgencyContext(): AgencyContext {
  const access = useAdminAccess();
  const [state, setState] = useState<AgencyContext>({
    status: "loading",
    isPlatformAdmin: false,
    agencies: [],
    selected: null,
    ambiguousSelection: false,
    error: null,
  });

  useEffect(() => {
    if (access.status === "loading") return;
    if (access.status !== "authorized") {
      // Terminal non-loading state — admin route handles unauth/unauthorized
      // before reading agency context. Critically, do NOT set status back to
      // "loading" here or the admin shell stays stuck on the loading screen.
      setState((prev) =>
        prev.status === "ready"
          ? prev // keep last known organisation context during transient auth refreshes
          : {
              status: "no-agency",
              isPlatformAdmin: false,
              agencies: [],
              selected: null,
              ambiguousSelection: false,
              error: null,
            },
      );
      return;
    }

    const memberships = access.memberships;
    if (memberships.length === 0) {
      setState({
        status: "no-agency",
        isPlatformAdmin: access.isPlatformAdmin,
        agencies: [],
        selected: null,
        ambiguousSelection: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    (async () => {
      const ids = memberships.map((m) => m.agency_id);
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name, slug")
        .in("id", ids);

      if (cancelled) return;
      if (error) {
        setState({
          status: "error",
          isPlatformAdmin: access.isPlatformAdmin,
          agencies: [],
          selected: null,
          ambiguousSelection: false,
          error: "Could not load agency information.",
        });
        return;
      }

      const byId = new Map((data ?? []).map((a) => [a.id, a]));
      const agencies: AgencyOption[] = memberships
        .map((m) => {
          const a = byId.get(m.agency_id);
          return a ? { id: a.id, name: a.name, slug: a.slug, role: m.role } : null;
        })
        .filter((x): x is AgencyOption => x !== null);

      setState({
        status: agencies.length > 0 ? "ready" : "no-agency",
        isPlatformAdmin: access.isPlatformAdmin,
        agencies,
        selected: agencies[0] ?? null,
        ambiguousSelection: agencies.length > 1,
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [access.status, access.memberships, access.isPlatformAdmin]);

  return state;
}
