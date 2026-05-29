import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AgencyMembership = {
  agency_id: string;
  role: "agency_owner" | "agency_admin" | "agency_staff" | string;
};

export type AdminAccess = {
  status: "loading" | "authorized" | "unauthorized" | "unauthenticated";
  isPlatformAdmin: boolean;
  memberships: AgencyMembership[];
  /** Primary role label for display, e.g. "platform_admin" or "agency_owner". */
  primaryRole: string | null;
  error: string | null;
};

const VALID_AGENCY_ROLES = new Set(["agency_owner", "agency_admin", "agency_staff"]);

export function useAdminAccess(): AdminAccess {
  const { status: authStatus, session } = useAuth();
  const [state, setState] = useState<AdminAccess>({
    status: "loading",
    isPlatformAdmin: false,
    memberships: [],
    primaryRole: null,
    error: null,
  });

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated" || !session) {
      setState({
        status: "unauthenticated",
        isPlatformAdmin: false,
        memberships: [],
        primaryRole: null,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));

    (async () => {
      const userId = session.user.id;
      const [rolesRes, membersRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("agency_members")
          .select("agency_id, role, accepted_at")
          .eq("user_id", userId)
          .not("accepted_at", "is", null),
      ]);

      if (cancelled) return;

      if (rolesRes.error || membersRes.error) {
        setState({
          status: "unauthorized",
          isPlatformAdmin: false,
          memberships: [],
          primaryRole: null,
          error: rolesRes.error?.message ?? membersRes.error?.message ?? "Access check failed",
        });
        return;
      }

      const isPlatformAdmin = (rolesRes.data ?? []).some((r) => r.role === "platform_admin");
      const memberships: AgencyMembership[] = (membersRes.data ?? [])
        .filter((m) => VALID_AGENCY_ROLES.has(m.role))
        .map((m) => ({ agency_id: m.agency_id, role: m.role }));

      const authorized = isPlatformAdmin || memberships.length > 0;
      const primaryRole = isPlatformAdmin
        ? "platform_admin"
        : memberships[0]?.role ?? null;

      setState({
        status: authorized ? "authorized" : "unauthorized",
        isPlatformAdmin,
        memberships,
        primaryRole,
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, session]);

  return state;
}
