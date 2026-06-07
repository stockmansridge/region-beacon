import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/placeholder";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
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

const STRIPE_ENV_SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_GROWTH",
  "STRIPE_PRICE_REGIONAL",
  "STRIPE_PRICE_PRO_REGION",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type StripeEnvSecretName = (typeof STRIPE_ENV_SECRET_NAMES)[number];

type StripeEdgeEnvCheckResult = {
  ok?: boolean;
  error?: string;
} & Partial<Record<StripeEnvSecretName, boolean>>;

type StripeCheckoutResult = { ok: true; url: string } | { ok: false; error: string };


function AccountPage() {
  const auth = useAuth();
  const access = useAdminAccess();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const agencyRole = agency.selected?.role ?? null;

  // Wait for both access + agency context to resolve before deciding access.
  // Otherwise canView is false during the brief loading window, NoAccessScreen
  // mounts, sees the user actually has a membership, and hard-redirects to
  // /admin — which looks like "Account & Billing kicks me back to Dashboard".
  const isBootstrapping =
    auth.status === "loading" ||
    access.status === "loading" ||
    agency.status === "loading" ||
    (access.status === "authorized" &&
      access.memberships.length > 0 &&
      agency.selected === null &&
      agency.status !== "error");

  const canView =
    access.isPlatformAdmin || (agencyRole !== null && ALLOWED_ROLES.has(agencyRole));

  const redirectReason = !canView
    ? !access.isPlatformAdmin && agencyRole === null
      ? "no agency role resolved"
      : !access.isPlatformAdmin && agencyRole !== null && !ALLOWED_ROLES.has(agencyRole)
        ? `role ${agencyRole} not in ALLOWED_ROLES`
        : "unknown"
    : null;

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[account-billing] route entered", {
      userId: auth.session?.user?.id ?? null,
      email: auth.email ?? null,
      authStatus: auth.status,
      accessStatus: access.status,
      agencyStatus: agency.status,
      agencyId,
      agencyName: agency.selected?.name ?? null,
      role: agencyRole,
      hasMembership: access.memberships.length > 0,
      isOwner: agencyRole === "agency_owner",
      isPlatformAdmin: access.isPlatformAdmin,
      isBootstrapping,
      canView,
      redirectReason: isBootstrapping ? null : redirectReason,
    });
  }, [
    auth.session?.user?.id,
    auth.email,
    auth.status,
    access.status,
    access.isPlatformAdmin,
    access.memberships.length,
    agency.status,
    agency.selected,
    agencyId,
    agencyRole,
    isBootstrapping,
    canView,
    redirectReason,
  ]);



  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [billingAccount, setBillingAccount] = useState<BillingAccountRow | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [effectivePlanCode, setEffectivePlanCode] = useState<string | null>(null);
  const [planSource, setPlanSource] = useState<string | null>(null);
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [venueCount, setVenueCount] = useState<number>(0);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequestRow[] | null>(null);
  const [upgradeTableMissing, setUpgradeTableMissing] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<PricingPlan | null>(null);
  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null);
  const [lastCheckoutError, setLastCheckoutError] = useState<string | null>(null);
  const [checkoutBanner, setCheckoutBanner] = useState<
    { tone: "success" | "warn"; message: string } | null
  >(null);

  // Temporary Supabase Edge Function env-check diagnostic (platform-admin only)
  const [envCheckLoading, setEnvCheckLoading] = useState(false);
  const [envCheckResult, setEnvCheckResult] = useState<StripeEdgeEnvCheckResult | null>(null);

  // Direct-fetch reachability diagnostic (platform-admin only)
  const [directFetchLoading, setDirectFetchLoading] = useState(false);
  const [directFetchResult, setDirectFetchResult] = useState<{
    url: string;
    status: number | null;
    contentType: string | null;
    bodyText: string;
    parsedJson: unknown;
    fetchError: string | null;
  } | null>(null);

  // Read ?checkout=success | cancelled once on mount and clean the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("checkout");
    if (v === "success") {
      setCheckoutBanner({
        tone: "success",
        message: "Payment received. Your plan will update shortly.",
      });
    } else if (v === "cancelled") {
      setCheckoutBanner({
        tone: "warn",
        message: "Checkout was cancelled. Your plan was not changed.",
      });
    }
    if (v) {
      params.delete("checkout");
      const search = params.toString();
      const url =
        window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    }
  }, []);

  const handleCheckout = useCallback(
    async (plan: PricingPlan) => {
      if (!agencyId) {
        toast.error("Select an organisation first.");
        return;
      }
      const planCode = plan.code;
      if (
        planCode !== "starter" &&
        planCode !== "growth" &&
        planCode !== "regional" &&
        planCode !== "pro_region"
      ) {
        return;
      }
      setCheckoutPlanCode(planCode);
      setLastCheckoutError(null);
      try {
        const envCheck = await supabase.functions.invoke<StripeEdgeEnvCheckResult>(
          "stripe-env-check",
        );
        if (envCheck.error) {
          const msg = envCheck.error.message || "Could not check Supabase Stripe secrets.";
          setLastCheckoutError(msg);
          toast.error(msg);
          setCheckoutPlanCode(null);
          return;
        }
        const envData = envCheck.data;
        const missing = STRIPE_ENV_SECRET_NAMES.filter(
          (name) => name.startsWith("STRIPE_") && envData?.[name] !== true,
        );
        if (missing.length > 0) {
          const msg = `Supabase Stripe secrets are missing: ${missing.join(", ")}.`;
          setEnvCheckResult(envData ?? { ok: false, error: msg });
          setLastCheckoutError(msg);
          toast.error(msg);
          setCheckoutPlanCode(null);
          return;
        }

        const { data: result, error: invokeError } = await supabase.functions.invoke<StripeCheckoutResult>(
          "create-stripe-checkout",
          {
            body: {
              agency_id: agencyId,
              plan_code: planCode,
              origin: window.location.origin,
            },
          },
        );
        if (invokeError || !result?.ok) {
          let msg = invokeError?.message || "Stripe Checkout failed.";
          if (result && !result.ok) msg = result.error;
          console.error("[checkout] edge function returned error", msg);
          setLastCheckoutError(msg);
          toast.error(msg + " You can submit an upgrade request below as a fallback.");
          setCheckoutPlanCode(null);
          return;
        }
        window.location.assign(result.url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[checkout] threw", err);
        setLastCheckoutError(msg);
        toast.error(`Could not open Stripe Checkout: ${msg}`);
        setCheckoutPlanCode(null);
      }
    },
    [agencyId],
  );

  const handleEnvCheck = useCallback(async () => {
    setEnvCheckLoading(true);
    setEnvCheckResult(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<StripeEdgeEnvCheckResult>(
        "stripe-env-check",
      );
      setEnvCheckResult(data ?? { ok: false, error: invokeError?.message ?? "Env check failed." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnvCheckResult({ ok: false, error: msg });
    } finally {
      setEnvCheckLoading(false);
    }
  }, []);

  const handleDirectFetchEnvCheck = useCallback(async () => {
    setDirectFetchLoading(true);
    setDirectFetchResult(null);
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/stripe-env-check`;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });
      const contentType = res.headers.get("content-type");
      const bodyText = await res.text();
      let parsedJson: unknown = null;
      try {
        parsedJson = JSON.parse(bodyText);
      } catch {
        parsedJson = null;
      }
      setDirectFetchResult({
        url,
        status: res.status,
        contentType,
        bodyText,
        parsedJson,
        fetchError: null,
      });
    } catch (err) {
      setDirectFetchResult({
        url,
        status: null,
        contentType: null,
        bodyText: "",
        parsedJson: null,
        fetchError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDirectFetchLoading(false);
    }
  }, []);

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

      // Effective plan (manual override > subscription > free) — matches System Admin.
      const planRes = await supabase.rpc("get_agency_plan_limits", {
        _agency_id: agencyId,
      });
      if (!signal?.cancelled) {
        if (planRes.error || !planRes.data) {
          setEffectivePlanCode(null);
          setPlanSource(null);
        } else {
          const data = planRes.data as { plan_code?: string; plan_source?: string };
          setEffectivePlanCode(data.plan_code ?? null);
          setPlanSource(data.plan_source ?? null);
        }
      }

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

  const loadUpgradeRequests = useCallback(async () => {
    if (!agencyId) return;
    const { data, error: reqErr } = await supabase
      .from("upgrade_requests" as never)
      .select("id, requested_plan_code, requested_plan_name, status, message, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (reqErr) {
      if (isMissingTableError(reqErr)) {
        setUpgradeTableMissing(true);
        setUpgradeRequests([]);
        return;
      }
      setUpgradeRequests([]);
      return;
    }
    setUpgradeTableMissing(false);
    setUpgradeRequests((data ?? []) as UpgradeRequestRow[]);
  }, [agencyId]);

  useEffect(() => {
    if (!canView || !agencyId) return;
    void loadUpgradeRequests();
  }, [canView, agencyId, loadUpgradeRequests]);

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


  if (isBootstrapping) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading account…</div>
      </div>
    );
  }

  if (!canView) {
    // eslint-disable-next-line no-console
    console.warn("[account-billing] access denied", { redirectReason, agencyRole, isPlatformAdmin: access.isPlatformAdmin });
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

  const currentPlan = getPlanByCode(effectivePlanCode ?? subscription?.plan_code);
  const planSourceLabel =
    planSource === "manual_override"
      ? "Manual billing plan"
      : planSource === "subscription"
        ? "Subscription"
        : planSource === "default"
          ? "Default"
          : null;
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

      {checkoutBanner && (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            checkoutBanner.tone === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          }`}
        >
          {checkoutBanner.message}
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
          {planSourceLabel && <Row label="Plan source" value={planSourceLabel} />}
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
              isCheckoutLoading={checkoutPlanCode === plan.code}
              onCheckout={() => handleCheckout(plan)}
              onRequest={() => setUpgradePlan(plan)}
            />
          ))}
        </div>
      </section>

      {lastCheckoutError && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <div className="font-semibold">Stripe Checkout failed</div>
          <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
            {lastCheckoutError}
          </div>
          {isPlatformAdmin && (
            <StripeEdgeEnvStatusPanel
              loading={envCheckLoading}
              result={envCheckResult}
            />
          )}
          <button
            type="button"
            onClick={() => setLastCheckoutError(null)}
            className="mt-2 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {isPlatformAdmin && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs">
          <div className="mb-2 font-semibold text-amber-800 dark:text-amber-300">
            Supabase Stripe secrets (platform admin)
          </div>
          <button
            type="button"
            onClick={handleEnvCheck}
            disabled={envCheckLoading}
            className="inline-flex h-8 items-center rounded-lg border border-amber-500/40 bg-background px-3 text-xs font-medium text-amber-800 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
          >
            {envCheckLoading ? "Checking…" : "Check Supabase Stripe secrets"}
          </button>
          <StripeEdgeEnvStatusPanel loading={envCheckLoading} result={envCheckResult} />

          <div className="mt-4 border-t border-amber-500/30 pt-3">
            <div className="mb-2 font-semibold text-amber-800 dark:text-amber-300">
              Direct fetch reachability (platform admin)
            </div>
            <p className="mb-2 text-muted-foreground">
              Bypasses supabase.functions.invoke. Calls the Edge Function URL directly so the real
              HTTP status, headers, and body are visible.
            </p>
            <button
              type="button"
              onClick={handleDirectFetchEnvCheck}
              disabled={directFetchLoading}
              className="inline-flex h-8 items-center rounded-lg border border-amber-500/40 bg-background px-3 text-xs font-medium text-amber-800 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
            >
              {directFetchLoading ? "Fetching…" : "Direct fetch stripe-env-check"}
            </button>
            {directFetchResult && (
              <div className="mt-3 space-y-2 rounded-lg border bg-background p-3 text-foreground">
                <DiagRow label="Request URL" value={directFetchResult.url} mono />
                <DiagRow
                  label="HTTP status"
                  value={directFetchResult.status === null ? "(no response)" : String(directFetchResult.status)}
                  mono
                />
                <DiagRow
                  label="content-type"
                  value={directFetchResult.contentType ?? "(none)"}
                  mono
                />
                {directFetchResult.fetchError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
                    <div className="font-semibold">Fetch error</div>
                    <div className="mt-1 break-words font-mono text-[11px]">
                      {directFetchResult.fetchError}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground">Raw body</div>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px]">
                    {directFetchResult.bodyText || "(empty)"}
                  </pre>
                </div>
                {directFetchResult.parsedJson !== null && (
                  <div>
                    <div className="text-[11px] font-semibold text-muted-foreground">Parsed JSON</div>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px]">
                      {JSON.stringify(directFetchResult.parsedJson, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {upgradeRequests && upgradeRequests.length > 0 && !upgradeTableMissing && (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Upgrade requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent plan upgrade requests for this organisation.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Requested plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {upgradeRequests.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-5 py-3 font-medium">{r.requested_plan_name}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.message
                        ? r.message.length > 80
                          ? `${r.message.slice(0, 80)}…`
                          : r.message
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <UpgradeRequestDialog
        plan={upgradePlan}
        agencyId={agencyId}
        defaultEmail={auth.email ?? ""}
        userId={auth.session?.user.id ?? null}
        onClose={() => setUpgradePlan(null)}
        onSubmitted={() => {
          setUpgradePlan(null);
          void loadUpgradeRequests();
        }}
      />


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

function StripeEdgeEnvStatusPanel({
  loading,
  result,
}: {
  loading: boolean;
  result: StripeEdgeEnvCheckResult | null;
}) {
  const allSecretsFalse = result
    ? STRIPE_ENV_SECRET_NAMES.every((name) => result[name] !== true)
    : false;

  return (
    <div className="mt-4 rounded-lg border border-destructive/30 bg-background p-4 text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Edge Function secret status</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Boolean results only. Secret values are never shown.
          </p>
        </div>
        <span className="rounded-full border bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {loading ? "checking" : result ? "checked" : "waiting"}
        </span>
      </div>

      {loading && <div className="mt-3 text-xs text-muted-foreground">Checking Supabase Edge Function…</div>}

      {result && (
        <>
          <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {STRIPE_ENV_SECRET_NAMES.map((name) => (
              <DiagRow
                key={name}
                label={`${name} present`}
                value={String(result[name] === true)}
                mono
              />
            ))}
          </dl>

          {allSecretsFalse && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              Supabase Edge Function cannot see Stripe secrets. Add the secrets to Supabase and redeploy the functions.
            </div>
          )}

          {result.error && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {result.error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PricingCard({
  plan,
  isCurrent,
  isCheckoutLoading,
  onCheckout,
  onRequest,
}: {
  plan: PricingPlan;
  isCurrent: boolean;
  isCheckoutLoading: boolean;
  onCheckout: () => void;
  onRequest: () => void;
}) {
  const recommended = plan.recommended === true;
  const isPaid =
    plan.code === "starter" ||
    plan.code === "growth" ||
    plan.code === "regional" ||
    plan.code === "pro_region";
  const isEnterprise = plan.code === "enterprise";
  const isFree = plan.code === "free";

  let label: string;
  let onClick: (() => void) | undefined;
  let disabled = false;
  let helpText: string;

  if (isCurrent) {
    label = "Current plan";
    onClick = undefined;
    disabled = true;
    helpText = "This is your active plan.";
  } else if (isCheckoutLoading) {
    label = "Opening Stripe…";
    onClick = undefined;
    disabled = true;
    helpText = "Redirecting to Stripe Checkout…";
  } else if (isPaid) {
    label = plan.cta;
    onClick = onCheckout;
    helpText = "Pay securely with Stripe. Activation is automatic.";
  } else if (isEnterprise) {
    label = plan.cta;
    onClick = onRequest;
    helpText = "We'll reach out to scope your Enterprise plan.";
  } else if (isFree) {
    label = "Free plan";
    onClick = undefined;
    disabled = true;
    helpText = "Downgrades aren't self-serve yet. Contact support if you need to step down.";
  } else {
    label = plan.cta;
    onClick = onRequest;
    helpText = UPGRADE_CTA_HELP;
  }

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
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60"
        >
          {label}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">{helpText}</p>
      </div>
    </div>
  );
}

function UpgradeRequestDialog({
  plan,
  agencyId,
  defaultEmail,
  userId,
  onClose,
  onSubmitted,
}: {
  plan: PricingPlan | null;
  agencyId: string | null;
  defaultEmail: string;
  userId: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (plan) {
      setName("");
      setEmail(defaultEmail);
      setMessage("");
    }
  }, [plan, defaultEmail]);

  const onSubmit = async () => {
    if (!plan || !agencyId) return;
    setSubmitting(true);
    const { error: insErr } = await supabase
      .from("upgrade_requests" as never)
      .insert({
        agency_id: agencyId,
        requested_plan_code: plan.code,
        requested_plan_name: plan.name,
        contact_name: name.trim() || null,
        contact_email: email.trim() || null,
        message: message.trim() || null,
        created_by: userId,
      } as never);
    setSubmitting(false);
    if (insErr) {
      if (isMissingTableError(insErr)) {
        toast.error("Upgrade requests are not enabled yet. Please contact support.");
        onClose();
        return;
      }
      toast.error(`Could not send request: ${insErr.message}`);
      return;
    }
    toast.success("Upgrade request sent. We'll review it and contact you shortly.");
    onSubmitted();
  };

  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request plan upgrade</DialogTitle>
          <DialogDescription>
            Submit an upgrade request and we'll activate your plan manually.
          </DialogDescription>
        </DialogHeader>
        {plan && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-semibold">{plan.name}</div>
              <div className="mt-1 text-muted-foreground">{plan.price}</div>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <li>{formatVenueLimit(plan.venueLimit)}</li>
                <li>{plan.events}</li>
                <li>{plan.passports}</li>
              </ul>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Contact name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Contact email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Message / notes
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Tell us about your venues, timing, or any questions."
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !agencyId}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send request"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function DiagRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 border-b border-amber-500/10 py-1 last:border-0">
      <dt className="min-w-[140px] text-muted-foreground">{label}</dt>
      <dd className={`flex-1 break-all ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
