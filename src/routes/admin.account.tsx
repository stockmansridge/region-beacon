import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useAuth } from "@/hooks/use-auth";
import { NoAccessScreen } from "@/components/no-access-screen";

export const Route = createFileRoute("/admin/account")({
  head: () => ({ meta: [{ title: "Account & Billing" }] }),
  component: AccountPage,
});

const ALLOWED_ROLES = new Set(["agency_owner", "agency_admin"]);

const COMING_SOON_HELP =
  "Payments are coming soon. You can continue setting up and previewing your event.";

type EventRow = {
  id: string;
  name: string;
  status: string;
};

type DomainRow = {
  event_id: string;
  public_subdomain: string | null;
  custom_domain: string | null;
  status: string;
  is_primary: boolean;
};

function AccountPage() {
  const auth = useAuth();
  const access = useAdminAccess();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const agencyRole = agency.selected?.role ?? null;

  const canView =
    access.isPlatformAdmin || (agencyRole !== null && ALLOWED_ROLES.has(agencyRole));

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView || !agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const [evRes, domRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, name, status")
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("event_domains")
          .select("event_id, public_subdomain, custom_domain, status, is_primary")
          .eq("agency_id", agencyId),
      ]);
      if (cancelled) return;
      if (evRes.error) {
        setError("Could not load events.");
        setLoading(false);
        return;
      }
      setEvents((evRes.data ?? []) as EventRow[]);
      setDomains(domRes.error ? [] : ((domRes.data ?? []) as DomainRow[]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, agencyId]);

  if (!canView) {
    return <NoAccessScreen email={auth.email ?? null} />;
  }

  const domainByEvent = new Map<string, DomainRow>();
  for (const d of domains) {
    const existing = domainByEvent.get(d.event_id);
    if (!existing || (d.is_primary && !existing.is_primary)) {
      domainByEvent.set(d.event_id, d);
    }
  }

  return (
    <>
      <PageHeader
        title="Account & Billing"
        description="Manage your agency account and event activations. Billing will be available soon."
      />

      <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Events can be created and previewed before payment. Public subdomains will
        remain pending until billing/activation is complete.
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <Row label="Agency" value={agency.selected?.name ?? "—"} />
          <Row label="Agency slug" value={agency.selected?.slug ?? "—"} mono />
          <Row label="Signed-in email" value={auth.email ?? "—"} />
          <Row label="Agency role" value={agencyRole ?? "—"} />
          {access.isPlatformAdmin && (
            <Row label="Platform role" value="platform_admin" />
          )}
        </Card>

        <Card title="Plan">
          <Row label="Current plan" value="Not active (Trial placeholder)" />
          <Row label="Status" value="Setup mode" />
          <p className="mt-3 text-sm text-muted-foreground">
            Billing is not connected yet.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <DisabledButton label="Start subscription" />
            <DisabledButton label="Manage billing" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{COMING_SOON_HELP}</p>
        </Card>
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Event activations</h2>
          <p className="text-xs text-muted-foreground">
            Each event needs to be activated before its public address goes live.
          </p>
        </div>

        {loading && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Loading events…
          </div>
        )}
        {!loading && events && events.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No events yet.{" "}
            <Link to="/admin/events" className="font-medium text-primary hover:underline">
              Create your first event
            </Link>
            .
          </div>
        )}
        {!loading && events && events.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Public address</th>
                <th className="px-5 py-3 font-medium">Activation</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const d = domainByEvent.get(e.id);
                const addrLabel = d
                  ? d.custom_domain ??
                    (d.public_subdomain
                      ? `${d.public_subdomain}.easypassport.app`
                      : "—")
                  : "Not reserved";
                const addrStatus = d ? d.status : "none";
                const activation =
                  d && d.status === "active"
                    ? "Pending billing"
                    : d && d.status === "pending"
                      ? "Pending billing"
                      : "Not activated";
                return (
                  <tr key={e.id} className="border-t">
                    <td className="px-5 py-3 font-medium">{e.name}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {e.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <div className="font-mono text-xs">{addrLabel}</div>
                      <div className="text-[10px] uppercase tracking-wider">
                        {addrStatus}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {activation}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DisabledButton label="Activate event" small />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
          {COMING_SOON_HELP}
        </div>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}

function DisabledButton({ label, small }: { label: string; small?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title={COMING_SOON_HELP}
      className={`inline-flex items-center rounded-lg border bg-muted text-muted-foreground opacity-70 cursor-not-allowed ${
        small ? "h-8 px-3 text-xs" : "h-9 px-3 text-sm"
      } font-medium`}
    >
      {label}
    </button>
  );
}
