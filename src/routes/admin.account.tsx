import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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

type BillingAccountRow = {
  id: string;
  billing_email: string | null;
  billing_name: string | null;
  country: string | null;
  stripe_customer_id: string | null;
};

type SubscriptionRow = {
  id: string;
  plan_code: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  updated_at: string;
};

type ActivationRow = {
  event_id: string;
  status: string;
  activation_kind: string | null;
  activated_at: string | null;
  expires_at: string | null;
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
  const [billingAccount, setBillingAccount] = useState<BillingAccountRow | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const isPlatformAdmin = access.isPlatformAdmin;

  const loadAll = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!agencyId) return;
      setLoading(true);
      setError(null);
      const [evRes, domRes, baRes, subRes] = await Promise.all([
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
        supabase
          .from("agency_billing_accounts")
          .select("id, billing_email, billing_name, country, stripe_customer_id")
          .eq("agency_id", agencyId)
          .maybeSingle(),
        supabase
          .from("agency_subscriptions")
          .select(
            "id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end, trial_ends_at, updated_at",
          )
          .eq("agency_id", agencyId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (signal?.cancelled) return;
      if (evRes.error) {
        setError("Could not load events.");
        setLoading(false);
        return;
      }
      const eventRows = (evRes.data ?? []) as EventRow[];
      setEvents(eventRows);
      setDomains(domRes.error ? [] : ((domRes.data ?? []) as DomainRow[]));
      setBillingAccount(baRes.error ? null : ((baRes.data ?? null) as BillingAccountRow | null));
      setSubscription(subRes.error ? null : ((subRes.data ?? null) as SubscriptionRow | null));

      const eventIds = eventRows.map((e) => e.id);
      if (eventIds.length > 0) {
        const actRes = await supabase
          .from("event_activations")
          .select("event_id, status, activation_kind, activated_at, expires_at")
          .in("event_id", eventIds);
        if (!signal?.cancelled) {
          setActivations(actRes.error ? [] : ((actRes.data ?? []) as ActivationRow[]));
        }
      } else {
        setActivations([]);
      }
      setLoading(false);
    },
    [agencyId],
  );

  useEffect(() => {
    if (!canView || !agencyId) return;
    const signal = { cancelled: false };
    void loadAll(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [canView, agencyId, loadAll]);

  const runManualActivation = useCallback(
    async (
      eventId: string,
      status: "comp" | "unpaid" | "active" | "past_due" | "cancelled",
      activationKind: "comp" | "one_time" | "included_in_plan",
    ) => {
      if (!isPlatformAdmin) return;
      setBusyEventId(eventId);
      const { error: rpcError } = await supabase.rpc("platform_set_event_activation", {
        _event_id: eventId,
        _status: status,
        _activation_kind: activationKind,
        _expires_at: null,
      });
      if (rpcError) {
        toast.error("Could not update activation. Please try again.");
        setBusyEventId(null);
        return;
      }
      toast.success("Activation updated.");
      await loadAll();
      setBusyEventId(null);
    },
    [isPlatformAdmin, loadAll],
  );


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

  const activationByEvent = new Map<string, ActivationRow>();
  for (const a of activations) {
    activationByEvent.set(a.event_id, a);
  }

  const planLabel = subscription?.plan_code ?? (subscription ? "—" : "No plan");
  const subStatus = subscription?.status ?? "none";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  const formatActivation = (a: ActivationRow | undefined) => {
    if (!a) return "Not activated";
    switch (a.status) {
      case "active":
        return "Active";
      case "comp":
        return "Comp";
      case "past_due":
        return "Past due";
      case "cancelled":
        return "Cancelled";
      case "unpaid":
      default:
        return "Unpaid";
    }
  };


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
          <OrganisationNameEditor
            agencyId={agencyId}
            currentName={agency.selected?.name ?? ""}
            canEdit={
              access.isPlatformAdmin ||
              agencyRole === "agency_owner" ||
              agencyRole === "agency_admin"
            }
          />
          <Row label="Agency slug" value={agency.selected?.slug ?? "—"} mono />
          <Row label="Signed-in email" value={auth.email ?? "—"} />
          <Row label="Agency role" value={agencyRole ?? "—"} />
          {access.isPlatformAdmin && (
            <Row label="Platform role" value="platform_admin" />
          )}
        </Card>

        <Card title="Plan">
          <Row label="Current plan" value={planLabel} />
          <Row label="Subscription status" value={subStatus} />
          {periodEnd && <Row label="Current period ends" value={periodEnd} />}
          {subscription?.cancel_at_period_end && (
            <Row label="Cancels at period end" value="Yes" />
          )}
          <Row
            label="Billing email"
            value={billingAccount?.billing_email ?? "—"}
          />
          <Row
            label="Stripe customer"
            value={billingAccount?.stripe_customer_id ?? "Not linked"}
            mono
          />
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
                      ? `${d.public_subdomain}.getstampd.com.au`
                      : "—")
                  : "Not reserved";
                const addrStatus = d ? d.status : "none";
                const act = activationByEvent.get(e.id);
                const activation = formatActivation(act);
                const activeLike = act?.status === "active" || act?.status === "comp";
                const activationClass = activeLike
                  ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400";
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
                      <span className={activationClass}>{activation}</span>
                      {act?.activation_kind && (
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {act.activation_kind}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <DisabledButton label="Activate event" small />
                        {isPlatformAdmin && (
                          <>
                            <button
                              type="button"
                              disabled={busyEventId === e.id}
                              onClick={() => runManualActivation(e.id, "comp", "comp")}
                              className="inline-flex h-8 items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
                            >
                              {busyEventId === e.id ? "Working…" : "Comp activate"}
                            </button>
                            <button
                              type="button"
                              disabled={busyEventId === e.id}
                              onClick={() => runManualActivation(e.id, "unpaid", "one_time")}
                              className="inline-flex h-8 items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
                            >
                              Set unpaid
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
          {COMING_SOON_HELP}
          {isPlatformAdmin && (
            <div className="mt-1 text-amber-700 dark:text-amber-400">
              Manual activation is for platform testing only. Stripe billing will replace this later.
            </div>
          )}
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

function OrganisationNameEditor({
  agencyId,
  currentName,
  canEdit,
}: {
  agencyId: string | null;
  currentName: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(currentName);
  }, [currentName]);

  if (!editing) {
    return (
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-muted-foreground">Organisation</span>
        <span className="flex items-center gap-2">
          <span className="font-medium">{currentName || "—"}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Edit
            </button>
          )}
        </span>
      </div>
    );
  }

  const trimmed = value.trim();
  const tooShort = trimmed.length < 2;
  const tooLong = trimmed.length > 120;
  const invalid = tooShort || tooLong;

  const onSave = async () => {
    if (!agencyId || invalid) return;
    setSaving(true);
    const { error } = await supabase
      .from("agencies")
      .update({ name: trimmed })
      .eq("id", agencyId);
    setSaving(false);
    if (error) {
      toast.error(`Could not update organisation name: ${error.message}`);
      return;
    }
    toast.success("Organisation name updated.");
    setEditing(false);
    // Refresh so the sidebar/header pick up the new name.
    window.location.reload();
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <label className="text-xs font-medium text-muted-foreground">
        Organisation name
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={120}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        autoFocus
      />
      {invalid && (
        <p className="text-xs text-destructive">
          {tooShort ? "Name must be at least 2 characters." : "Name is too long (max 120)."}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(currentName);
          }}
          disabled={saving}
          className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || invalid}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
