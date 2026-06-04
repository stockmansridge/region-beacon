import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useAuth } from "@/hooks/use-auth";
import { NoAccessScreen } from "@/components/no-access-screen";
import { formatRoleLabel } from "@/lib/role-labels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GETSTAMPD_PRICING_PLANS,
  formatVenueLimit,
  getNextPlanAfter,
  getNextPlanForVenueCount,
  getPlanByCode,
  getVenueUsageMessage,
  type PricingPlan,
} from "@/lib/getstampd-pricing";

export const Route = createFileRoute("/admin/account")({
  head: () => ({ meta: [{ title: "Account & Billing" }] }),
  component: AccountPage,
});

const ALLOWED_ROLES = new Set(["agency_owner", "agency_admin"]);

const COMING_SOON_HELP =
  "Online billing is coming soon. You can continue setting up and testing GetStampd.";

const UPGRADE_CTA_HELP =
  "Online billing is coming soon. For now, submit an upgrade request and we'll activate your plan manually.";

type UpgradeRequestRow = {
  id: string;
  requested_plan_code: string;
  requested_plan_name: string;
  status: string;
  message: string | null;
  created_at: string;
};

function isMissingTableError(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST204") return true;
  return /relation .* does not exist|could not find the table/i.test(err.message ?? "");
}

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
  const [venueCount, setVenueCount] = useState<number>(0);

  const isPlatformAdmin = access.isPlatformAdmin;

  const loadAll = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!agencyId) return;
      setLoading(true);
      setError(null);
      const [evRes, domRes, baRes, subRes, venueRes] = await Promise.all([
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
        supabase
          .from("venues")
          .select("id", { count: "exact", head: true })
          .eq("agency_id", agencyId)
          .is("deleted_at", null),
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
      setVenueCount(venueRes.error ? 0 : (venueRes.count ?? 0));

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

  const currentPlan = getPlanByCode(subscription?.plan_code);
  const subStatus = subscription?.status ?? "none";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  const venueUsageMessage = getVenueUsageMessage(venueCount, currentPlan);
  const nextPlan =
    getNextPlanAfter(currentPlan.code) ?? getNextPlanForVenueCount(venueCount);
  const limit = currentPlan.venueLimit;
  let venueNotice: { tone: "info" | "warn" | "danger"; message: string } | null = null;
  if (limit !== null) {
    if (venueCount > limit) {
      venueNotice = {
        tone: "danger",
        message: `This organisation is over the ${currentPlan.name} plan venue limit.${
          nextPlan ? ` Upgrade to ${nextPlan.name} or higher.` : ""
        }`,
      };
    } else if (venueCount >= limit) {
      venueNotice = {
        tone: "warn",
        message: `You have reached the ${currentPlan.name} plan venue limit.${
          nextPlan ? ` Upgrade to ${nextPlan.name} to add more venues.` : ""
        }`,
      };
    } else if (limit - venueCount <= 1) {
      venueNotice = {
        tone: "info",
        message: `You are close to your ${currentPlan.name} plan venue limit.${
          nextPlan ? ` ${nextPlan.name} includes ${formatVenueLimit(nextPlan.venueLimit).toLowerCase()}.` : ""
        }`,
      };
    }
  }

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


  const canEditOrg =
    access.isPlatformAdmin ||
    agencyRole === "agency_owner" ||
    agencyRole === "agency_admin";

  return (
    <>
      <PageHeader
        title="Account & Billing"
        description="Manage your organisation account and event activations. Billing will be available soon."
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
        <Card title="Organisation">
          <OrganisationNameEditor
            agencyId={agencyId}
            currentName={agency.selected?.name ?? ""}
            canEdit={canEditOrg}
          />
          <OrganisationSlugEditor
            agencyId={agencyId}
            currentSlug={agency.selected?.slug ?? ""}
            canEdit={canEditOrg}
          />
          <Row label="Signed-in email" value={auth.email ?? "—"} />
          <Row label="Organisation role" value={formatRoleLabel(agencyRole)} />
          {access.isPlatformAdmin && (
            <Row label="Platform role" value={formatRoleLabel("platform_admin")} />
          )}

        </Card>

        <Card title="Plan">
          <Row label="Current plan" value={currentPlan.name} />
          <Row label="Venue usage" value={venueUsageMessage} />
          <Row label="Venue limit" value={formatVenueLimit(currentPlan.venueLimit)} />
          <Row label="Events" value={currentPlan.events} />
          <Row label="Passports" value={currentPlan.passports} />
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
          {venueNotice && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                venueNotice.tone === "danger"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : venueNotice.tone === "warn"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300"
              }`}
            >
              {venueNotice.message}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <DisabledButton label="View plans" />
            <DisabledButton label="Upgrade plan" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{COMING_SOON_HELP}</p>
        </Card>

      </div>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Plans based on number of venues</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start free with up to 5 venues. Upgrade when your trail grows.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GETSTAMPD_PRICING_PLANS.map((plan) => (
            <PricingCard
              key={plan.code}
              plan={plan}
              isCurrent={plan.code === currentPlan.code}
            />
          ))}
        </div>
      </section>

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

function PricingCard({ plan, isCurrent }: { plan: PricingPlan; isCurrent: boolean }) {
  const recommended = plan.recommended === true;
  return (
    <div
      className={`relative flex h-full flex-col rounded-xl border bg-card p-5 ${
        recommended ? "border-primary ring-2 ring-primary/40" : ""
      }`}
    >
      {recommended && (
        <span className="absolute -top-2 right-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
          Recommended
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-2 left-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          Current plan
        </span>
      )}
      <div className="mb-3">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatVenueLimit(plan.venueLimit)}
        </p>
        <p className="mt-1 text-lg font-semibold">{plan.price}</p>
      </div>
      <ul className="mb-4 space-y-1 text-sm text-muted-foreground">
        <li>{plan.events}</li>
        <li>{plan.passports}</li>
        <li>{plan.support}</li>
      </ul>
      <div className="mt-auto">
        <DisabledButton label={plan.cta} />
        <p className="mt-2 text-[11px] text-muted-foreground">{COMING_SOON_HELP}</p>
      </div>
    </div>
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

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

function OrganisationSlugEditor({
  agencyId,
  currentSlug,
  canEdit,
}: {
  agencyId: string | null;
  currentSlug: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentSlug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentSlug);
  }, [currentSlug]);

  if (!editing) {
    return (
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-muted-foreground">Organisation URL name</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs">{currentSlug || "—"}</span>
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

  const normalized = value.trim().toLowerCase();
  const formatValid = SLUG_REGEX.test(normalized) && normalized.length >= 3;
  const unchanged = normalized === currentSlug;

  const onSave = async () => {
    if (!agencyId || !formatValid || unchanged) return;
    setSaving(true);
    setError(null);

    // Best-effort availability check. RLS may hide other organisations' rows,
    // so a "not found" here is not a guarantee — the update below is the real
    // race-safe check via the unique constraint.
    const { data: existing } = await supabase
      .from("agencies")
      .select("id")
      .eq("slug", normalized)
      .maybeSingle();
    if (existing && existing.id !== agencyId) {
      setSaving(false);
      setError("That organisation URL name is already taken.");
      return;
    }

    const { error: updErr } = await supabase
      .from("agencies")
      .update({ slug: normalized })
      .eq("id", agencyId);
    setSaving(false);

    if (updErr) {
      // 23505 = unique_violation
      const code = (updErr as { code?: string }).code;
      if (code === "23505" || /duplicate|unique/i.test(updErr.message)) {
        setError("That organisation URL name is already taken.");
      } else {
        setError(`Could not update URL name: ${updErr.message}`);
      }
      return;
    }

    toast.success("Organisation URL name updated.");
    setEditing(false);
    // Refresh so sidebar/header/agency context pick up the new slug.
    window.location.reload();
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <label className="text-xs font-medium text-muted-foreground">
        Organisation URL name
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        maxLength={50}
        placeholder="my-organisation"
        className="h-9 w-full rounded-md border bg-background px-3 font-mono text-sm"
        autoFocus
      />
      <p className="text-[11px] text-muted-foreground">
        Used for workspace links and internal organisation references. Use lowercase
        letters, numbers, and hyphens only. Public event URLs are not changed.
      </p>
      <p className="text-[11px] text-amber-700 dark:text-amber-400">
        Changing this URL name may affect admin workspace links. Public event URLs
        are not changed.
      </p>
      {!formatValid && normalized.length > 0 && (
        <p className="text-xs text-destructive">
          URL name format is invalid.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(currentSlug);
            setError(null);
          }}
          disabled={saving}
          className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !formatValid || unchanged}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save URL name"}
        </button>
      </div>
    </div>
  );
}
