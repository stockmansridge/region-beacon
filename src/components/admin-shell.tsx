import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Calendar, BarChart3, Settings, LogOut, Shield, CreditCard } from "lucide-react";
import { ReactNode } from "react";
import { signOut } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";

/**
 * Sidebar nav items.
 *
 * Each entry uses an explicit literal `to` typed via `as const` so that
 * TanStack Router's typed <Link> still validates the path. We render the
 * items individually below (instead of mapping into <Link to={item.to} />)
 * because TanStack's `LinkProps['to']` is a discriminated union of route
 * literals and cannot be satisfied by a generic `string` without unsafe
 * casts. Listing the links keeps full type-safety with no `as any` /
 * `as never` hacks.
 */
const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/events", label: "Events", icon: Calendar, exact: false },
  // Venue Library is intentionally hidden from the sidebar for MVP.
  // The /admin/venues route still renders a "Coming Soon" page if accessed
  // directly, but agency users manage venues inside each event for now.
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, exact: false },
] as const;

export function AdminShell({
  children,
  email,
  role,
  agencyName,
  agencyRole,
  ambiguousAgency,
  isPlatformAdmin,
}: {
  children?: ReactNode;
  email?: string | null;
  role?: string | null;
  agencyName?: string | null;
  agencyRole?: string | null;
  ambiguousAgency?: boolean;
  isPlatformAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  };
  const location = useLocation();

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    }`;

  return (
    <div className="flex min-h-screen bg-sidebar">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="h-8 w-8 rounded-lg bg-hero-gradient" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">GetStampd</div>
            <div className="text-xs text-muted-foreground">Event admin</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {/* Rendered individually so each <Link to=...> stays type-safe. */}
          {(() => {
            const [dash, events, analytics] = navItems;
            return (
              <>
                <Link to={dash.to} className={linkClass(isActive(dash.to, dash.exact))}>
                  <dash.icon className="h-4 w-4" />
                  {dash.label}
                </Link>
                <Link to={events.to} className={linkClass(isActive(events.to, events.exact))}>
                  <events.icon className="h-4 w-4" />
                  {events.label}
                </Link>
                <Link to={analytics.to} className={linkClass(isActive(analytics.to, analytics.exact))}>
                  <analytics.icon className="h-4 w-4" />
                  {analytics.label}
                </Link>
                {(isPlatformAdmin ||
                  agencyRole === "agency_owner" ||
                  agencyRole === "agency_admin") && (
                  <Link
                    to="/admin/account"
                    className={linkClass(isActive("/admin/account", false))}
                  >
                    <CreditCard className="h-4 w-4" />
                    Account & Billing
                  </Link>
                )}
                {isPlatformAdmin && (
                  <Link
                    to="/admin/system"
                    className={linkClass(isActive("/admin/system", false))}
                  >
                    <Shield className="h-4 w-4" />
                    System Admin
                  </Link>
                )}
              </>
            );
          })()}
        </nav>
        <div className="border-t p-3">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col bg-background">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div>
            <div className="text-xs text-muted-foreground">
              {agencyName ? "Agency workspace" : "Signed in as"}
            </div>
            <div className="text-sm font-semibold">
              {agencyName ?? email ?? "—"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {ambiguousAgency && (
              <span
                title="You belong to multiple agencies. Showing the first one until an agency switcher is added."
                className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
              >
                Multi-agency (temp)
              </span>
            )}
            {agencyRole && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {agencyRole}
              </span>
            )}
            {role && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {role}
              </span>
            )}
            <div className="hidden text-right text-xs text-muted-foreground sm:block">
              {email}
            </div>
            <div className="h-8 w-8 rounded-full bg-hero-gradient" />
          </div>
        </header>
        <div className="flex-1 p-6 lg:p-8">{children ?? <Outlet />}</div>
      </div>
    </div>
  );
}
