import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AdminShell } from "@/components/admin-shell";
import { NoAccessScreen } from "@/components/no-access-screen";
import { useAuth, signOut } from "@/hooks/use-auth";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

// Routes under /admin that do NOT require an authenticated admin session.
// These render via <Outlet /> without going through the auth/agency gates.
const PUBLIC_ADMIN_PATHS = new Set<string>(["/admin/login", "/admin/update-password"]);

function AdminLayout() {
  const { status: authStatus, email } = useAuth();
  const access = useAdminAccess();
  const agency = useAgencyContext();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.has(location.pathname);

  // "Latched positive" verdicts. Once we've successfully observed an
  // authorized session and a selected organisation for this user, we keep
  // rendering the normal admin shell even if a downstream query briefly
  // re-enters a loading / empty state (token refresh, navigation refetch,
  // tab focus, etc.). This is the source-of-truth fix for the
  // "No organisation yet" flash on login and route changes.
  const hasEverBeenAuthorized = useRef(false);
  const hasEverHadSelectedAgency = useRef(false);
  if (access.status === "authorized") hasEverBeenAuthorized.current = true;
  if (agency.selected !== null) hasEverHadSelectedAgency.current = true;
  // Reset latches when the user signs out so a different user logging in
  // on the same tab gets a clean verdict.
  if (authStatus === "unauthenticated") {
    hasEverBeenAuthorized.current = false;
    hasEverHadSelectedAgency.current = false;
  }

  useEffect(() => {
    if (authStatus === "unauthenticated" && !isPublicAdminPath) {
      navigate({ to: "/admin/login", replace: true });
    }
  }, [authStatus, navigate, isPublicAdminPath]);

  // Public child routes (login, password reset) must render even when
  // unauthenticated — they're nested under /admin only for URL grouping.
  if (isPublicAdminPath) return <Outlet />;

  if (authStatus === "unauthenticated") return <Outlet />;

  // Bootstrap state: positively true only after every dependent query has
  // completed at least once. We never trust a "null/empty" intermediate
  // value as proof of "no organisation".
  const isBootstrapping =
    authStatus === "loading" ||
    access.status === "loading" ||
    agency.status === "loading" ||
    // access says authorized with memberships, but agency context hasn't
    // resolved a selection yet — wait for it.
    (access.status === "authorized" &&
      access.memberships.length > 0 &&
      agency.selected === null &&
      agency.status !== "error");

  // Confirmed no-access: only after access has resolved to "unauthorized"
  // AND we've never previously seen a positive verdict for this session.
  const confirmedUnauthorized =
    !isBootstrapping &&
    access.status === "unauthorized" &&
    !hasEverBeenAuthorized.current;

  // Confirmed no-organisation: user is positively authorized, agency
  // context has positively resolved, the user truly has zero memberships,
  // is not a platform admin with a selection, and we've never previously
  // observed a selected agency in this session.
  const confirmedNoAgency =
    !isBootstrapping &&
    access.status === "authorized" &&
    agency.status === "no-agency" &&
    access.memberships.length === 0 &&
    agency.selected === null &&
    !hasEverHadSelectedAgency.current;

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (confirmedUnauthorized) return <NoAccessScreen email={email} />;

  return (
    <AdminShell
      email={email}
      role={access.primaryRole}
      agencyId={agency.selected?.id ?? null}
      agencyName={agency.selected?.name ?? null}
      agencyRole={agency.selected?.role ?? null}
      ambiguousAgency={agency.ambiguousSelection}
      isPlatformAdmin={access.isPlatformAdmin}
    >
      {confirmedNoAgency ? (
        <NoAgencyState
          isPlatformAdmin={agency.isPlatformAdmin}
          onSignOut={async () => {
            await signOut();
            navigate({ to: "/admin/login", replace: true });
          }}
        />
      ) : agency.status === "error" ? (
        <ErrorState message={agency.error ?? "Could not load organisation information."} />
      ) : (
        <Outlet />
      )}
    </AdminShell>
  );
}

function NoAgencyState({
  isPlatformAdmin,
  onSignOut,
}: {
  isPlatformAdmin: boolean;
  onSignOut: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center">
      <h1 className="text-lg font-semibold">No organisation selected</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isPlatformAdmin ? (
          <>
            You're signed in as a platform admin but you don't have an organisation membership yet.
            Create or assign an organisation before opening dashboard data.
          </>
        ) : (
          <>You don't have an active organisation membership yet.</>
        )}
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
      >
        Sign out
      </button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
      {message}
    </div>
  );
}
