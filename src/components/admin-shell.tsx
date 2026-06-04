import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Calendar, BarChart3, LogOut, Shield, CreditCard, Bug, Menu, LifeBuoy } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { signOut } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";

import { useDiagnosticsEnabled } from "@/lib/diagnostics";
import { Switch } from "@/components/ui/switch";
import { formatRoleLabel } from "@/lib/role-labels";
import { ContactSupportDialog } from "@/components/contact-support-dialog";
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
  agencyId,
  agencyName,
  agencyRole,
  ambiguousAgency,
  isPlatformAdmin,
}: {
  children?: ReactNode;
  email?: string | null;
  role?: string | null;
  agencyId?: string | null;
  agencyName?: string | null;
  agencyRole?: string | null;
  ambiguousAgency?: boolean;
  isPlatformAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useDiagnosticsEnabled();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  };
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
      active
        ? "bg-[#2F6FE4] text-white shadow-[0_6px_16px_rgba(47,111,228,0.28)]"
        : "text-[#CBD5E1] hover:bg-[#10233A] hover:text-white"
    }`;

  const iconClass = (active: boolean) =>
    `h-4 w-4 ${active ? "text-white" : "text-[#94A3B8]"}`;

  const showAccount =
    isPlatformAdmin ||
    agencyRole === "agency_owner" ||
    agencyRole === "agency_admin";

  const NavLinks = () => {
    const [dash, events, analytics] = navItems;
    const dashActive = isActive(dash.to, dash.exact);
    const evActive = isActive(events.to, events.exact);
    const anActive = isActive(analytics.to, analytics.exact);
    const acctActive = isActive("/admin/account", false);
    const sysActive = isActive("/admin/system", false);
    return (
      <>
        <Link to={dash.to} className={linkClass(dashActive)}>
          <dash.icon className={iconClass(dashActive)} />
          {dash.label}
        </Link>
        <Link to={events.to} className={linkClass(evActive)}>
          <events.icon className={iconClass(evActive)} />
          {events.label}
        </Link>
        <Link to={analytics.to} className={linkClass(anActive)}>
          <analytics.icon className={iconClass(anActive)} />
          {analytics.label}
        </Link>
        {showAccount && (
          <Link to="/admin/account" className={linkClass(acctActive)}>
            <CreditCard className={iconClass(acctActive)} />
            Account & Billing
          </Link>
        )}
        {isPlatformAdmin && (
          <Link to="/admin/system" className={linkClass(sysActive)}>
            <Shield className={iconClass(sysActive)} />
            System Admin
          </Link>
        )}
      </>
    );
  };

  const footerLinkClass =
    "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-[#CBD5E1] hover:bg-[#10233A] hover:text-white transition-colors";

  const FooterControls = () => (
    <>
      {isPlatformAdmin && (
        <label
          className="mb-1 flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-sm text-[#CBD5E1] hover:bg-[#10233A] hover:text-white transition-colors"
          title="Show platform_admin diagnostic panels. Stored locally in this browser only."
        >
          <span className="flex items-center gap-3">
            <Bug className="h-4 w-4 text-[#94A3B8]" /> Diagnostics
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
        onClick={() => setSupportOpen(true)}
        className={footerLinkClass}
      >
        <LifeBuoy className="h-4 w-4 text-[#94A3B8]" /> Contact support
      </button>
      <button type="button" onClick={handleSignOut} className={footerLinkClass}>
        <LogOut className="h-4 w-4 text-[#94A3B8]" /> Sign out
      </button>
    </>
  );

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#071527]">
      <ContactSupportDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        organisationId={agencyId ?? null}
      />

      {/* Mobile top bar (< lg) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#E6ECF4] bg-white px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open admin menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#D9E2EF] bg-white text-[#111827] hover:bg-[#F8FAFC]"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-[#071527] p-0 text-[#CBD5E1]">
              <SheetHeader className="shrink-0 border-b border-[#10233A] px-5 py-4 text-left">
                <SheetTitle className="text-white">
                  <GetStampdLogo variant="blue" size="md" caption="Event admin" />
                </SheetTitle>
              </SheetHeader>
              <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
                <NavLinks />
              </nav>
              <div className="shrink-0 border-t border-[#10233A] px-4 py-4">
                <div className="mb-3 px-3 text-xs text-[#94A3B8]">
                  <div className="font-medium text-white">
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
        <div className="flex items-center gap-2 truncate text-xs text-[#64748B]">
          <span className="max-w-[160px] truncate">{agencyName ?? email ?? ""}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-[260px] shrink-0 flex-col overflow-hidden border-r border-[#10233A] bg-[#071527] lg:flex">
          <div className="shrink-0 px-5 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#2F6FE4] text-base font-bold text-white shadow-sm">
                G
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">GetStampd</div>
                <div className="text-xs text-[#94A3B8]">Event admin</div>
              </div>
            </div>
          </div>
          <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4">
            <NavLinks />
          </nav>
          <div className="shrink-0 space-y-1.5 px-4 py-5">
            <FooterControls />
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F5F7FB] text-[#111827]">
          <header className="hidden h-[72px] shrink-0 items-center justify-between border-b border-[#E6ECF4] bg-white px-8 lg:flex">
            <div>
              <div className="text-xs font-medium text-[#64748B]">
                {agencyName ? "Organisation workspace" : "Signed in as"}
              </div>
              <div className="text-sm font-semibold text-[#111827]">
                {agencyName ?? email ?? "—"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {ambiguousAgency && (
                <span
                  title="You belong to multiple organisations. Showing the first one until an organisation switcher is added."
                  className="rounded-full bg-[#FFF7ED] px-3 py-1.5 text-xs font-medium text-[#9A3412] ring-1 ring-[#FED7AA]"
                >
                  Multi-organisation (temp)
                </span>
              )}
              {agencyRole && (
                <span className="rounded-full bg-[#F1F5F9] px-3 py-1.5 text-xs font-medium text-[#475569]">
                  {formatRoleLabel(agencyRole)}
                </span>
              )}
              {role && (
                <span className="rounded-full bg-[#EAF2FF] px-3 py-1.5 text-xs font-semibold text-[#1F56C5]">
                  {formatRoleLabel(role)}
                </span>
              )}
              {email && (
                <div className="hidden text-right text-xs text-[#64748B] sm:block">
                  {email}
                </div>
              )}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2F6FE4] text-sm font-semibold text-white">
                {(email ?? "?").slice(0, 1).toUpperCase()}
              </div>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            <div className="space-y-5">{children ?? <Outlet />}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
