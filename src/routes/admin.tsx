import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell } from "@/components/admin-shell";
import { NoAccessScreen } from "@/components/no-access-screen";
import { useAuth } from "@/hooks/use-auth";
import { useAdminAccess } from "@/hooks/use-admin-access";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { status: authStatus, email } = useAuth();
  const access = useAdminAccess();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      navigate({ to: "/admin/login", replace: true });
    }
  }, [authStatus, navigate]);

  if (authStatus === "loading" || access.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") return null;

  if (access.status === "unauthorized") {
    return <NoAccessScreen email={email} />;
  }

  return (
    <AdminShell email={email} role={access.primaryRole}>
      <Outlet />
    </AdminShell>
  );
}
