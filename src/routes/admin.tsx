import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
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

  useEffect(() => {
    if (authStatus === "unauthenticated" && !isPublicAdminPath) {
      navigate({ to: "/admin/login", replace: true });
    }
  }, [authStatus, navigate, isPublicAdminPath]);

  // Public child routes (login, password reset) must render even when
  // unauthenticated — they're nested under /admin only for URL grouping.
  if (isPublicAdminPath) return <Outlet />;

  if (authStatus === "unauthenticated") return <Outlet />;

  // Treat any non-terminal state as loading so we never flash the
  // "No organisation" recovery card while auth / access / agency queries
  // are still resolving (e.g. after a token refresh or hard reload).
  const isResolving =
    authStatus === "loading" ||
    access.status === "loading" ||
    agency.status === "loading" ||
    // access resolved authorized but agency context hasn't caught up yet
    (access.status === "authorized" &&
      access.memberships.length > 0 &&
      agency.selected === null &&
      agency.status !== "error");

  if (isResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (access.status === "unauthorized") return <NoAccessScreen email={email} />;

  // Only show the "No organisation" recovery card when access is fully
  // resolved AND the user genuinely has no memberships. This avoids the
  // 1–2s flash when navigating into Account & Billing.
  const showNoAgency =
    agency.status === "no-agency" &&
    access.status === "authorized" &&
    access.memberships.length === 0 &&
    agency.selected === null;

  return (
    <AdminShell
      email={email}
      role={access.primaryRole}
      agencyName={agency.selected?.name ?? null}
      agencyRole={agency.selected?.role ?? null}
      ambiguousAgency={agency.ambiguousSelection}
      isPlatformAdmin={access.isPlatformAdmin}
    >
      {showNoAgency ? (
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
