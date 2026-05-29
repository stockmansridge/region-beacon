import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/placeholder";
import { Calendar, MapPin, QrCode, Users } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin dashboard" }] }),
  component: Dashboard,
});

const stats = [
  { label: "Active events", value: "—", icon: Calendar },
  { label: "Venues", value: "—", icon: MapPin },
  { label: "Check-ins (7d)", value: "—", icon: QrCode },
  { label: "Visitors", value: "—", icon: Users },
];

function Dashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Overview of your white-label event passports." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-2xl font-semibold">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">Awaiting live data</div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold">Recent activity</h3>
          <p className="mt-2 text-sm text-muted-foreground">Visitor check-ins will appear here once events go live.</p>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold">Quick start</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>1. Create an event</li>
            <li>2. Add venues and generate QR codes</li>
            <li>3. Customise branding and publish</li>
          </ul>
        </div>
      </div>
    </>
  );
}
