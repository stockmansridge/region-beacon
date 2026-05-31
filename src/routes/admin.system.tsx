import { createFileRoute } from "@tanstack/react-router";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { NoAccessScreen } from "@/components/no-access-screen";
import { useAuth } from "@/hooks/use-auth";
import {
  Building2,
  Users,
  Calendar,
  ScrollText,
  CreditCard,
  Settings2,
} from "lucide-react";

export const Route = createFileRoute("/admin/system")({
  head: () => ({ meta: [{ title: "System Admin — GetStampd" }] }),
  component: SystemAdmin,
});

const sections = [
  {
    icon: Building2,
    title: "Organisations",
    desc: "Create, suspend and inspect organisation tenants across the platform.",
  },
  {
    icon: Users,
    title: "Users & invites",
    desc: "Manage platform admin users and pending organisation invitations.",
  },
  {
    icon: Calendar,
    title: "Events across platform",
    desc: "Cross-organisation view of all events, statuses and check-in volume.",
  },
  {
    icon: ScrollText,
    title: "Audit logs",
    desc: "Platform-wide audit trail of administrative actions.",
  },
  {
    icon: CreditCard,
    title: "Billing",
    desc: "Plans, usage, invoices and payment status per organisation.",
  },
  {
    icon: Settings2,
    title: "System settings",
    desc: "Reserved subdomains, feature flags and global defaults.",
  },
];

function SystemAdmin() {
  const access = useAdminAccess();
  const { email } = useAuth();

  // Client-side gate. The matching server-side guarantee comes from RLS
  // policies on the underlying tables (platform_admin via has_role), so even
  // if this check were bypassed, no privileged data would load.
  if (access.status === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }
  if (!access.isPlatformAdmin) {
    return <NoAccessScreen email={email} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <span className="rounded-full bg-primary/10 px-2 py-0.5">platform_admin</span>
          <span className="text-muted-foreground">/ System Admin</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">System Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Platform-wide controls reserved for GetStampd platform administrators.
          Tools below are placeholders — functionality will land in later steps.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-2xl border bg-card p-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            <div className="mt-4 inline-flex rounded-md border border-dashed bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
              Coming later
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed bg-muted/30 p-5 text-xs text-muted-foreground">
        Note: this area is intentionally read-only for now. No create, edit or
        delete actions are wired. Organisation and event admin tooling remains in the
        main Event admin dashboard.
      </div>
    </div>
  );
}
