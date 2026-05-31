import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Calendar, BarChart3, Settings, LogOut, Shield, CreditCard, Bug, Menu } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { signOut } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";
import { TestEnvBanner } from "@/components/test-env-banner";
import { useDiagnosticsEnabled } from "@/lib/diagnostics";
import { Switch } from "@/components/ui/switch";
import { formatRoleLabel } from "@/lib/role-labels";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/events", label: "Events", icon: Calendar, exact: false },
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
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useDiagnosticsEnabled();
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  };
  const location = useLocation();

  // Auto-close drawer when route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    }`;

  const showAccount =
    isPlatformAdmin ||
    agencyRole === "agency_owner" ||
    agencyRole === "agency_admin";

  const NavLinks = () => {
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
        {showAccount && (
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
  };

  const FooterControls = () => (
    <>
      {isPlatformAdmin && (
        <label
          className="mb-1 flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
          title="Show platform_admin diagnostic panels. Stored locally in this browser only."
        >
          <span className="flex items-center gap-3">
            <Bug className="h-4 w-4" /> Diagnostics
          </span>
          <Switch
            checked={diagnosticsEnabled}
            onCheckedChange={(v) => setDiagnosticsEnabled(Boolean(v))}
            aria-label="Toggle platform admin diagnostics"
          />
        </label>
      )}
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
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-sidebar">
      <TestEnvBanner />

      {/* Mobile top bar (visible < lg) */}
      <header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open admin menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-foreground hover:bg-muted"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetHeader className="border-b px-5 py-4 text-left">
                <SheetTitle>
                  <GetStampdLogo variant="blue" size="md" caption="Event admin" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 space-y-1 p-3">
                <NavLinks />
              </nav>
              <div className="border-t p-3">
                <div className="mb-3 px-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">
                    {agencyName ?? email ?? "—"}
                  </div>
                  {email && agencyName && <div className="truncate">{email}</div>}
                </div>
                <FooterControls />
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <GetStampdLogo variant="blue" size="sm" caption="Admin" />
          </div>
        </div>
        <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          <span className="max-w-[160px] truncate">{agencyName ?? email ?? ""}</span>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:flex lg:flex-col">
          <div className="flex h-16 items-center border-b px-5">
            <GetStampdLogo variant="blue" size="md" caption="Event admin" />
          </div>
          <nav className="flex-1 space-y-1 p-3">
            <NavLinks />
          </nav>
          <div className="border-t p-3">
            <FooterControls />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="hidden h-16 items-center justify-between border-b bg-background px-6 lg:flex">
            <div>
              <div className="text-xs text-muted-foreground">
                {agencyName ? "Organisation workspace" : "Signed in as"}
              </div>
              <div className="text-sm font-semibold">
                {agencyName ?? email ?? "—"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {ambiguousAgency && (
                <span
                  title="You belong to multiple organisations. Showing the first one until an organisation switcher is added."
                  className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                >
                  Multi-organisation (temp)
                </span>
              )}
              {agencyRole && (
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {formatRoleLabel(agencyRole)}
                </span>
              )}
              {role && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {formatRoleLabel(role)}
                </span>
              )}

              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                {email}
              </div>
              <div className="h-8 w-8 rounded-full bg-hero-gradient" />
            </div>
          </header>
          <div className="flex-1 p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div>
        </div>
      </div>
    </div>
  );
}
