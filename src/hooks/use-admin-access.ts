import { useEffect, useRef, useState } from "react";
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

  // Track which user we last positively resolved access for. The Supabase
  // `session` object identity changes on every token refresh, but the user
  // id is stable. We use this to avoid flipping a previously-authorized
  // verdict back to "loading" — or worse, transiently to "unauthorized" —
  // while a background refetch is in flight.
  const lastResolvedUserId = useRef<string | null>(null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated" || !session) {
      lastResolvedUserId.current = null;
      setState({
        status: "unauthenticated",
        isPlatformAdmin: false,
        memberships: [],
        primaryRole: null,
        error: null,
      });
      return;
    }

    const currentUserId = session.user.id;
    let cancelled = false;

    // Only reset to "loading" if this is a brand-new user. If we've already
    // resolved access for this same user, keep the last verdict visible
    // while we refetch in the background. This prevents the admin shell
    // from flashing "No organisation yet" when the Supabase session object
    // is replaced (token refresh, tab focus, route remount, etc.).
    if (lastResolvedUserId.current !== currentUserId) {
      setState((s) => ({ ...s, status: "loading", error: null }));
    }

    (async () => {
      const [rolesRes, membersRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", currentUserId),
        supabase
          .from("agency_members")
          .select("agency_id, role, accepted_at")
          .eq("user_id", currentUserId)
          .not("accepted_at", "is", null),
      ]);

      if (cancelled) return;

      if (rolesRes.error || membersRes.error) {
        // Errors during a background refetch must NOT downgrade an
        // already-authorized user. Only surface as unauthorized if we
        // have no prior verdict for this user.
        if (lastResolvedUserId.current === currentUserId) {
          setState((s) => ({
            ...s,
            error:
              rolesRes.error?.message ??
              membersRes.error?.message ??
              "Access check failed",
          }));
          return;
        }
        setState({
          status: "unauthorized",
          isPlatformAdmin: false,
          memberships: [],
          primaryRole: null,
          error:
            rolesRes.error?.message ??
            membersRes.error?.message ??
            "Access check failed",
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

      lastResolvedUserId.current = currentUserId;
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
    // Depend on the stable user id, not the session object reference, so
    // routine token refreshes don't retrigger the access query.
  }, [authStatus, userId]);

  return state;
}
