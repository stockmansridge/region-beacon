import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Users,
  Calendar,
  ScrollText,
  CreditCard,
  Settings2,
  LayoutDashboard,
  LifeBuoy,
  Search,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Trash2,
  Archive,
  MailCheck,
} from "lucide-react";
import { authUrl } from "@/lib/auth-redirect";
import { tenantUrl } from "@/lib/domains";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { NoAccessScreen } from "@/components/no-access-screen";
import { useAuth } from "@/hooks/use-auth";
import { formatRoleLabel, formatMemberType } from "@/lib/role-labels";
import { RESERVED_SUBDOMAINS, isReservedSubdomain, isValidSubdomainLabel } from "@/lib/reserved-subdomains";
import { getPlanByCode, normalizePlanCode } from "@/lib/getstampd-pricing";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export const Route = createFileRoute("/admin/system")({
  head: () => ({ meta: [{ title: "System Admin — GetStampd" }] }),
  component: SystemAdmin,
});

// -------- Shared types ----------------------------------------------------

type Overview = {
  total_organisations: number;
  active_organisations: number;
  organisations_this_month: number;
  total_events: number;
  published_events: number;
  draft_events: number;
  total_venues: number;
  total_passports: number;
  total_checkins: number;
  checkins_24h: number;
  checkins_7d: number;
};

type PlanSource = "manual_override" | "subscription" | "default";

type OrganisationRow = {
  agency_id: string;
  name: string;
  slug: string | null;
  status: string | null;
  billing_email: string | null;
  created_at: string;
  owner_email: string | null;
  member_count: number;
  event_count: number;
  published_event_count: number;
  venue_count: number;
  passport_count: number;
  checkin_count: number;
  effective_plan_code?: string | null;
  plan_source?: PlanSource | string | null;
  manual_plan_override?: string | null;
  manual_plan_override_at?: string | null;
  signup_intention?: string | null;
};

const PLAN_SOURCE_META: Record<string, { label: string; cls: string }> = {
  manual_override: { label: "Manual override", cls: "bg-[#FEF3C7] text-[#92400E]" },
  subscription: { label: "Subscription", cls: "bg-[#DCFCE7] text-[#166534]" },
  default: { label: "Default", cls: "bg-[#F1F5F9] text-[#475569]" },
};

function PlanCell({ row }: { row: OrganisationRow }) {
  const code = row.effective_plan_code ?? row.manual_plan_override ?? "free";
  const plan = getPlanByCode(code);
  const source = (row.plan_source ?? (row.manual_plan_override ? "manual_override" : "default")) as string;
  const meta = PLAN_SOURCE_META[source] ?? PLAN_SOURCE_META.default;
  return (
    <div>
      <div className="text-sm font-medium text-[#0F172A]">{plan.name}</div>
      <span
        className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
      >
        {meta.label}
      </span>
    </div>
  );
}

type UserRow = {
  user_id: string | null;
  email: string | null;
  role: string | null;
  scope: "platform" | "organisation" | string;
  agency_id: string | null;
  agency_name: string | null;
  invited_email: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

type PendingOrganisationSignupRow = {
  id: string;
  email: string;
  full_name: string | null;
  organisation_name: string;
  organisation_slug: string | null;
  signup_intention: string | null;
  auth_user_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  completed_agency_id: string | null;
  last_error: string | null;
};

type EventRow = {
  event_id: string;
  agency_id: string;
  agency_name: string;
  agency_slug: string | null;
  event_name: string;
  event_slug: string | null;
  public_slug: string | null;
  public_subdomain: string | null;
  custom_domain: string | null;
  subdomain_status: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  deleted_at: string | null;
  days_since_archived: number | null;
  venue_count: number;
  passport_count: number;
  checkin_count: number;
  last_checkin_at: string | null;
  activation_status: string | null;
};

type PlanLimits = {
  plan_code: string | null;
  venue_limit: number | null;
  active_event_limit: number | null;
  passport_limit: number | null;
  plan_source?: "manual_override" | "subscription" | "default" | null;
};

type PlanOverride = {
  manual_plan_override: string | null;
  manual_plan_override_at: string | null;
  manual_plan_override_by: string | null;
};


type SubscriptionRow = {
  id: string;
  plan_code: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  trial_ends_at: string | null;
  updated_at: string | null;
  stripe_subscription_id: string | null;
};

type AuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  agency_id: string | null;
  agency_name: string | null;
  event_id: string | null;
  event_name: string | null;
  target_table: string | null;
  target_id: string | null;
  metadata: unknown;
};

// -------- Filter / drilldown state ----------------------------------------

type EventsFilter = {
  status: "all" | "draft" | "published" | "ended" | "archived";
  recent: "all" | "24h" | "7d";
  sort: "default" | "checkins" | "passports" | "recent";
};

type OrgsFilter = {
  status: "all" | "active" | "suspended" | string;
  sort: "default" | "venues" | "passports" | "checkins";
};

const DEFAULT_EVENTS_FILTER: EventsFilter = {
  status: "all",
  recent: "all",
  sort: "default",
};
const DEFAULT_ORGS_FILTER: OrgsFilter = { status: "all", sort: "default" };

// -------- Helpers ---------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return new Intl.NumberFormat().format(n);
}

function isMissingFn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

const MISSING_RPC_HINT =
  "System Admin RPCs are not installed yet. Apply supabase/migrations-system-admin-rpcs/apply.sql in the Supabase SQL editor.";

function statusPill(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    published: "bg-[#DCFCE7] text-[#166534]",
    active: "bg-[#DCFCE7] text-[#166534]",
    draft: "bg-[#FEF3C7] text-[#92400E]",
    ended: "bg-[#E2E8F0] text-[#475569]",
    archived: "bg-[#E2E8F0] text-[#475569]",
    suspended: "bg-[#FEE2E2] text-[#991B1B]",
    unpaid: "bg-[#FEE2E2] text-[#991B1B]",
    past_due: "bg-[#FEE2E2] text-[#991B1B]",
    cancelled: "bg-[#E2E8F0] text-[#475569]",
    comp: "bg-[#EAF2FF] text-[#1F56C5]",
  };
  const cls = map[s] ?? "bg-[#F1F5F9] text-[#475569]";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {status ?? "—"}
    </span>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[16px] border border-[#E6ECF4] bg-white p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  onClick,
  title,
}: {
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
  title?: string;
}) {
  const interactive = !!onClick;
  const content = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#0F172A]">
        {typeof value === "number" ? fmtNum(value) : value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[#64748B]">{hint}</div>
      ) : null}
    </>
  );
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="text-left rounded-[16px] border border-[#E6ECF4] bg-white p-5 transition hover:border-[#9CC0FF] hover:shadow-sm hover:bg-[#F8FBFF] focus:outline-none focus:ring-2 focus:ring-[#9CC0FF] cursor-pointer"
      >
        {content}
      </button>
    );
  }
  return <Card>{content}</Card>;
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#CBD5E1] bg-white p-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-[#0F172A]">{title}</div>
      <div className="mt-1 text-xs text-[#64748B]">{message}</div>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{message}</div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-[8px] border border-[#FCA5A5] bg-white px-2.5 py-1 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      ) : null}
    </div>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-sm text-[#64748B]">
        Loading…
      </TableCell>
    </TableRow>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF2FF] px-3 py-1 text-xs font-medium text-[#1F56C5]">
      <span>Filtered: {label}</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-0.5 hover:bg-[#D6E4FB]"
        title="Clear filter"
        aria-label="Clear filter"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// -------- Hash state ------------------------------------------------------

type HashState = {
  tab: string;
  eventsFilter: EventsFilter;
  orgsFilter: OrgsFilter;
};

function parseHash(): Partial<HashState> {
  if (typeof window === "undefined") return {};
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const tab = params.get("tab") ?? undefined;
  const ev: Partial<EventsFilter> = {};
  const status = params.get("status");
  if (status) ev.status = status as EventsFilter["status"];
  const recent = params.get("recent");
  if (recent) ev.recent = recent as EventsFilter["recent"];
  const sort = params.get("sort");
  if (sort) ev.sort = sort as EventsFilter["sort"];
  const orgStatus = params.get("orgStatus");
  const orgSort = params.get("orgSort");
  return {
    tab,
    eventsFilter: Object.keys(ev).length
      ? { ...DEFAULT_EVENTS_FILTER, ...ev }
      : undefined,
    orgsFilter:
      orgStatus || orgSort
        ? {
            ...DEFAULT_ORGS_FILTER,
            status: (orgStatus as OrgsFilter["status"]) ?? "all",
            sort: (orgSort as OrgsFilter["sort"]) ?? "default",
          }
        : undefined,
  };
}

function writeHash(state: HashState) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state.tab && state.tab !== "overview") params.set("tab", state.tab);
  if (state.eventsFilter.status !== "all") params.set("status", state.eventsFilter.status);
  if (state.eventsFilter.recent !== "all") params.set("recent", state.eventsFilter.recent);
  if (state.eventsFilter.sort !== "default") params.set("sort", state.eventsFilter.sort);
  if (state.orgsFilter.status !== "all") params.set("orgStatus", state.orgsFilter.status);
  if (state.orgsFilter.sort !== "default") params.set("orgSort", state.orgsFilter.sort);
  const next = params.toString();
  const url = next ? `#${next}` : window.location.pathname + window.location.search;
  window.history.replaceState(null, "", next ? `${window.location.pathname}${window.location.search}#${next}` : url);
}

// -------- Delete user dialog ---------------------------------------------

type DeleteUserTarget = {
  user_id: string;
  email: string | null;
  member_type: string;
  agency_names: string[];
};

function DeleteUserDialog({
  target,
  currentUserId,
  onClose,
  onDeleted,
}: {
  target: DeleteUserTarget | null;
  currentUserId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (target) setConfirm("");
  }, [target]);

  const isSelf = !!target && !!currentUserId && target.user_id === currentUserId;
  const ready = confirm.trim().toUpperCase() === "DELETE" && !isSelf;

  const handleDelete = async () => {
    if (!target || !ready) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc("system_admin_delete_user", {
      _target_user_id: target.user_id,
    });
    setDeleting(false);
    if (error) {
      toast.error(error.message || "Could not delete user.");
      return;
    }
    const payload = data as { success?: boolean; deleted_user_id?: string } | null;
    if (!payload?.success) {
      toast.error("Delete failed. No success flag returned.");
      return;
    }
    toast.success(`Deleted ${target.email ?? "user"}.`);
    onDeleted();
    onClose();
  };

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !deleting) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[#991B1B]">
            <Trash2 className="h-4 w-4" />
            Delete user from GetStampd
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-[#475569]">
              <p>
                This will remove this user from GetStampd. Their organisation
                memberships, role assignments, and related access records will
                be removed. This action cannot be undone.
              </p>
              {target ? (
                <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3 text-xs text-[#0F172A]">
                  <div>
                    <span className="text-[#64748B]">Email: </span>
                    <span className="font-medium">{target.email ?? "—"}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[#64748B]">Member type: </span>
                    <span className="font-medium">{target.member_type}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[#64748B]">Organisations: </span>
                    <span className="font-medium">
                      {target.agency_names.length
                        ? target.agency_names.join(", ")
                        : "—"}
                    </span>
                  </div>
                </div>
              ) : null}
              {isSelf ? (
                <div className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
                  You cannot delete your own platform admin account.
                </div>
              ) : (
                <div>
                  <label className="text-[11px] font-medium text-[#0F172A]">
                    Type <code className="rounded bg-[#F1F5F9] px-1">DELETE</code> to confirm
                  </label>
                  <Input
                    autoFocus
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="mt-1"
                    disabled={deleting}
                  />
                </div>
              )}
              <p className="text-[11px] text-[#64748B]">
                Organisations, events, venues, passports, and check-ins are
                not removed. An owner being deleted leaves the organisation
                intact and ownerless for platform admin follow-up.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready || deleting}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="bg-[#DC2626] text-white hover:bg-[#B91C1C]"
          >
            {deleting ? "Deleting…" : "Delete user"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// -------- Main component --------------------------------------------------

function SystemAdmin() {

  const access = useAdminAccess();
  const { email } = useAuth();

  const initial = useRef<Partial<HashState> | null>(null);
  if (initial.current === null) initial.current = parseHash();

  const [tab, setTab] = useState<string>(initial.current.tab ?? "overview");
  const [eventsFilter, setEventsFilter] = useState<EventsFilter>(
    initial.current.eventsFilter ?? DEFAULT_EVENTS_FILTER,
  );
  const [orgsFilter, setOrgsFilter] = useState<OrgsFilter>(
    initial.current.orgsFilter ?? DEFAULT_ORGS_FILTER,
  );

  useEffect(() => {
    writeHash({ tab, eventsFilter, orgsFilter });
  }, [tab, eventsFilter, orgsFilter]);

  const goToEvents = useCallback(
    (patch: Partial<EventsFilter>) => {
      setEventsFilter({ ...DEFAULT_EVENTS_FILTER, ...patch });
      setTab("events");
    },
    [],
  );
  const goToOrgs = useCallback(
    (patch: Partial<OrgsFilter>) => {
      setOrgsFilter({ ...DEFAULT_ORGS_FILTER, ...patch });
      setTab("orgs");
    },
    [],
  );

  if (access.status === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[#64748B]">
        Checking access…
      </div>
    );
  }
  if (!access.isPlatformAdmin) {
    return <NoAccessScreen email={email} />;
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 text-xs font-medium text-[#2F6FE4]">
          <span className="rounded-full bg-[#EAF2FF] px-2 py-0.5">
            platform_admin
          </span>
          <span className="text-[#64748B]">/ System Admin</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#0F172A]">
          System Admin
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#64748B]">
          Platform-wide views reserved for GetStampd platform administrators.
          All data is read directly from the production database via guarded
          RPCs.
        </p>
      </header>

      <SupportTicketsAlert onOpen={() => setTab("support")} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-[12px] bg-white p-1 ring-1 ring-[#E6ECF4]">
          <TabsTrigger value="overview" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="orgs" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <Building2 className="h-4 w-4" /> Organisations
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <Users className="h-4 w-4" /> Users & invites
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <Calendar className="h-4 w-4" /> Events
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <LifeBuoy className="h-4 w-4" /> Support tickets
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <ScrollText className="h-4 w-4" /> Audit logs
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <CreditCard className="h-4 w-4" /> Billing
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2 rounded-[8px] data-[state=active]:bg-[#EAF2FF] data-[state=active]:text-[#1F56C5]">
            <Settings2 className="h-4 w-4" /> System settings
          </TabsTrigger>
        </TabsList>

        <div className="mt-5">
          <TabsContent value="overview">
            <OverviewSection goToEvents={goToEvents} goToOrgs={goToOrgs} />
          </TabsContent>
          <TabsContent value="orgs">
            <OrganisationsSection filter={orgsFilter} setFilter={setOrgsFilter} />
          </TabsContent>
          <TabsContent value="users"><UsersSection /></TabsContent>
          <TabsContent value="events">
            <EventsSection filter={eventsFilter} setFilter={setEventsFilter} />
          </TabsContent>
          <TabsContent value="support"><SupportTicketsSection /></TabsContent>
          <TabsContent value="audit"><AuditSection /></TabsContent>
          <TabsContent value="billing"><BillingSection /></TabsContent>
          <TabsContent value="settings"><SettingsSection /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// -------- Overview --------------------------------------------------------

function OverviewSection({
  goToEvents,
  goToOrgs,
}: {
  goToEvents: (patch: Partial<EventsFilter>) => void;
  goToOrgs: (patch: Partial<OrgsFilter>) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_overview");
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setLoading(false);
      return;
    }
    setData(data as Overview);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-[16px] border border-[#E6ECF4] bg-white p-8 text-center text-sm text-[#64748B]">
        Loading overview…
      </div>
    );
  }
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return <EmptyState title="No data" message="No overview data returned." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Organisations"
        value={data.total_organisations}
        hint={`${fmtNum(data.active_organisations)} active · ${fmtNum(data.organisations_this_month)} this month`}
        onClick={() => goToOrgs({})}
        title="View all organisations"
      />
      <StatCard
        label="Active organisations"
        value={data.active_organisations}
        onClick={() => goToOrgs({ status: "active" })}
        title="Filter organisations by active"
      />
      <StatCard
        label="Total events"
        value={data.total_events}
        hint={`${fmtNum(data.published_events)} published · ${fmtNum(data.draft_events)} draft`}
        onClick={() => goToEvents({})}
        title="View all events"
      />
      <StatCard
        label="Published events"
        value={data.published_events}
        onClick={() => goToEvents({ status: "published" })}
        title="Filter events by published"
      />
      <StatCard
        label="Draft events"
        value={data.draft_events}
        onClick={() => goToEvents({ status: "draft" })}
        title="Filter events by draft"
      />
      <StatCard
        label="Venues"
        value={data.total_venues}
        hint="Across all organisations"
        onClick={() => goToOrgs({ sort: "venues" })}
        title="Sort organisations by venue count"
      />
      <StatCard
        label="Visitor passports"
        value={data.total_passports}
        onClick={() => goToEvents({ sort: "passports" })}
        title="Sort events by passport count"
      />
      <StatCard
        label="Check-ins (all time)"
        value={data.total_checkins}
        onClick={() => goToEvents({ sort: "checkins" })}
        title="Sort events by check-in count"
      />
      <StatCard
        label="Check-ins (24h)"
        value={data.checkins_24h}
        onClick={() => goToEvents({ recent: "24h", sort: "recent" })}
        title="Events with check-ins in the last 24 hours"
      />
      <StatCard
        label="Check-ins (7d)"
        value={data.checkins_7d}
        onClick={() => goToEvents({ recent: "7d", sort: "recent" })}
        title="Events with check-ins in the last 7 days"
      />
      <StatCard
        label="New orgs this month"
        value={data.organisations_this_month}
        onClick={() => goToOrgs({})}
        title="View all organisations"
      />
    </div>
  );
}

// -------- Organisations ---------------------------------------------------

function OrganisationsSection({
  filter,
  setFilter,
}: {
  filter: OrgsFilter;
  setFilter: (f: OrgsFilter) => void;
}) {
  const [rows, setRows] = useState<OrganisationRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrganisationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganisationRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_organisations");
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as OrganisationRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (filter.status !== "all" && (r.status ?? "") !== filter.status) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.slug ?? "").toLowerCase().includes(needle) ||
        (r.owner_email ?? "").toLowerCase().includes(needle)
      );
    });
    if (filter.sort === "venues") list = [...list].sort((a, b) => b.venue_count - a.venue_count);
    else if (filter.sort === "passports") list = [...list].sort((a, b) => b.passport_count - a.passport_count);
    else if (filter.sort === "checkins") list = [...list].sort((a, b) => b.checkin_count - a.checkin_count);
    return list;
  }, [rows, q, filter]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const hasActiveFilter = filter.status !== "all" || filter.sort !== "default";
  const chipLabel =
    filter.status !== "all" && filter.sort !== "default"
      ? `${filter.status} · sorted by ${filter.sort}`
      : filter.status !== "all"
        ? `${filter.status} organisations`
        : `sorted by ${filter.sort}`;

  return (
    <div className="space-y-3">
      {hasActiveFilter ? (
        <div className="flex items-center gap-2">
          <FilterChip label={chipLabel} onClear={() => setFilter(DEFAULT_ORGS_FILTER)} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            placeholder="Search by name, slug or owner email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v as OrgsFilter["status"] })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-[#64748B]">
          {rows ? `${fmtNum(filtered.length)} of ${fmtNum(rows.length)}` : ""}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Organisation</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Venues</TableHead>
              <TableHead className="text-right">Passports</TableHead>
              <TableHead className="text-right">Check-ins</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={11} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-[#64748B]">
                  No organisations match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.agency_id}
                  className="cursor-pointer hover:bg-[#F8FBFF]"
                  onClick={() => setSelected(r)}
                >
                  <TableCell>
                    <div className="font-medium text-[#0F172A]">{r.name}</div>
                    <div className="text-xs text-[#64748B]">{r.slug ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm text-[#0F172A]">
                    {r.owner_email ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{fmtNum(r.member_count)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtNum(r.event_count)}
                    <div className="text-[11px] text-[#64748B]">
                      {fmtNum(r.published_event_count)} live
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">{fmtNum(r.venue_count)}</TableCell>
                  <TableCell className="text-right text-sm">{fmtNum(r.passport_count)}</TableCell>
                  <TableCell className="text-right text-sm">{fmtNum(r.checkin_count)}</TableCell>
                  <TableCell><PlanCell row={r} /></TableCell>
                  <TableCell>{statusPill(r.status)}</TableCell>
                  <TableCell className="text-sm text-[#64748B]">{fmtDate(r.created_at)}</TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {r.slug ? (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await copyToClipboard(r.slug!);
                            setCopied(r.agency_id);
                            setTimeout(() => setCopied((c) => (c === r.agency_id ? null : c)), 1500);
                          }}
                          className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                          title="Copy organisation slug"
                        >
                          {copied === r.agency_id ? (
                            <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Slug
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(r);
                        }}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-[#FECACA] bg-white px-2 py-1 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                        title="Delete organisation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <OrganisationDetailDrawer org={selected} onClose={() => setSelected(null)} onUpdated={load} />
      <DeleteOrganisationDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  );
}

function DeleteOrganisationDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: OrganisationRow | null;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (target) setConfirm("");
  }, [target]);

  const ready = confirm.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!target || !ready) return;
    // eslint-disable-next-line no-console
    console.log("[delete-org] start", { agency_id: target.agency_id, name: target.name });
    setDeleting(true);
    const { data, error } = await supabase.rpc("system_admin_delete_organisation", {
      _agency_id: target.agency_id,
    });
    setDeleting(false);
    if (error) {
      const err = error as { message?: string; details?: string; hint?: string; code?: string };
      // eslint-disable-next-line no-console
      console.error("[delete-org] rpc error", {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code,
      });
      const description = [
        err.message,
        err.details,
        err.hint,
        err.code ? `Code: ${err.code}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      toast.error(description || "Could not delete organisation.");
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[delete-org] rpc success", data);
    const payload = data as { success?: boolean } | null;
    if (!payload?.success) {
      toast.error("Delete failed. No success flag returned.");
      return;
    }
    toast.success(`Deleted ${target.name}.`);
    await onDeleted();
    onClose();
  };



  return (
    <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !deleting) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[#991B1B]">
            <Trash2 className="h-4 w-4" />
            Delete organisation
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-[#475569]">
              <p>
                This removes the organisation from the System Admin list and
                hides it from customer-facing views. Events, venues, passports,
                check-ins, analytics, and billing records are preserved and can
                be restored by a platform admin if needed.
              </p>
              {target ? (
                <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3 text-xs text-[#0F172A]">
                  <div>
                    <span className="text-[#64748B]">Name: </span>
                    <span className="font-medium">{target.name}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[#64748B]">Slug: </span>
                    <span className="font-medium">{target.slug ?? "—"}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[#64748B]">Owner: </span>
                    <span className="font-medium">{target.owner_email ?? "—"}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[#64748B]">Events / Venues / Passports: </span>
                    <span className="font-medium">
                      {target.event_count} / {target.venue_count} / {target.passport_count}
                    </span>
                  </div>
                </div>
              ) : null}
              <div>
                <label className="text-[11px] font-medium text-[#0F172A]">
                  Type <code className="rounded bg-[#F1F5F9] px-1">DELETE</code> to confirm
                </label>
                <Input
                  autoFocus
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="mt-1"
                  disabled={deleting}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready || deleting}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            className="bg-[#DC2626] text-white hover:bg-[#B91C1C]"
          >
            {deleting ? "Deleting…" : "Delete organisation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}



function OrganisationDetailDrawer({
  org,
  onClose,
  onUpdated,
}: {
  org: OrganisationRow | null;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [override, setOverride] = useState<PlanOverride | null>(null);
  const [overrideForm, setOverrideForm] = useState<string>("free");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadPlan = useCallback(async (agencyId: string) => {
    setPlanLoading(true);
    setPlanError(null);
    const [limitsRes, subRes, billingRes, overrideRes] = await Promise.all([
      supabase.rpc("get_agency_plan_limits", { _agency_id: agencyId }),
      supabase
        .from("agency_subscriptions")
        .select(
          "id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end, trial_ends_at, updated_at, stripe_subscription_id",
        )
        .eq("agency_id", agencyId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("agency_billing_accounts")
        .select("stripe_customer_id")
        .eq("agency_id", agencyId)
        .maybeSingle(),
      supabase.rpc("get_organisation_plan_override", { p_agency_id: agencyId }),
    ]);
    if (limitsRes.error) {
      setPlanError(limitsRes.error.message);
      setPlanLimits(null);
    } else {
      setPlanLimits((limitsRes.data ?? null) as PlanLimits | null);
    }
    const sub = subRes.error ? null : ((subRes.data ?? null) as SubscriptionRow | null);
    setSubscription(sub);
    const stripeCustomer =
      billingRes.error || !billingRes.data
        ? null
        : ((billingRes.data as { stripe_customer_id: string | null }).stripe_customer_id ?? null);
    setStripeCustomerId(stripeCustomer);
    const ov = overrideRes.error
      ? null
      : ((overrideRes.data ?? null) as
          | (PlanOverride & { effective_plan?: PlanLimits })
          | null);
    setOverride(ov);
    setOverrideForm(normalizePlanCode(ov?.manual_plan_override ?? "free"));
    setPlanLoading(false);
  }, []);

  const [refreshTick, setRefreshTick] = useState(0);
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const [deleteTarget, setDeleteTarget] = useState<DeleteUserTarget | null>(null);

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    setLoading(true);
    setIdCopied(false);
    setPlanLimits(null);
    setSubscription(null);
    setOverride(null);
    (async () => {
      const [ev, us] = await Promise.all([
        supabase.rpc("system_admin_events"),
        supabase.rpc("system_admin_users"),
      ]);
      if (cancelled) return;
      setEvents(((ev.data ?? []) as EventRow[]).filter((e) => e.agency_id === org.agency_id));
      setUsers(((us.data ?? []) as UserRow[]).filter((u) => u.agency_id === org.agency_id));
      setLoading(false);
    })();
    loadPlan(org.agency_id);
    return () => { cancelled = true; };
  }, [org, loadPlan, refreshTick]);


  const handleSaveOverride = async () => {
    if (!org) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("save_organisation_plan_override", {
      p_agency_id: org.agency_id,
      p_plan_key: overrideForm,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Could not save manual plan override.");
      return;
    }
    const payload = data as { success?: boolean } | null;
    if (!payload?.success) {
      toast.error("Save failed. No success flag returned.");
      return;
    }
    toast.success(`Manual plan override saved: ${getPlanByCode(overrideForm).name}.`);
    await loadPlan(org.agency_id);
    onUpdated?.();
  };

  const handleClearOverride = async () => {
    if (!org) return;
    setClearing(true);
    const { data, error } = await supabase.rpc("clear_organisation_plan_override", {
      p_agency_id: org.agency_id,
    });
    setClearing(false);
    if (error) {
      toast.error(error.message || "Could not clear manual plan override.");
      return;
    }
    const payload = data as { success?: boolean } | null;
    if (!payload?.success) {
      toast.error("Clear failed. No success flag returned.");
      return;
    }
    toast.success("Manual plan override cleared.");
    await loadPlan(org.agency_id);
    onUpdated?.();
  };


  const handleCopyId = async () => {
    if (!org) return;
    await copyToClipboard(org.agency_id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1500);
  };


  return (
    <Sheet open={!!org} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {org ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1F56C5]" />
                {org.name}
              </SheetTitle>
              <SheetDescription>
                {org.slug ? <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[11px]">{org.slug}</code> : "No slug"}
                {" · "}Created {fmtDate(org.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5">
              <div className="flex items-start justify-between gap-3 rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">
                    Organisation ID
                  </div>
                  <code className="mt-1 block break-all text-xs text-[#0F172A]">
                    {org.agency_id}
                  </code>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    Use this ID for Supabase diagnostics, plan-limit checks, support, and platform admin troubleshooting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  title="Copy organisation ID"
                >
                  {idCopied ? (
                    <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {idCopied ? "Copied" : "Copy ID"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <KV label="Owner" value={org.owner_email ?? "—"} />
              <KV label="Status" value={<span>{statusPill(org.status)}</span>} />
              <KV label="Members" value={fmtNum(org.member_count)} />
              <KV label="Events" value={`${fmtNum(org.event_count)} (${fmtNum(org.published_event_count)} live)`} />
              <KV label="Venues" value={fmtNum(org.venue_count)} />
              <KV label="Passports" value={fmtNum(org.passport_count)} />
              <KV label="Check-ins" value={fmtNum(org.checkin_count)} />
              <KV label="Billing email" value={org.billing_email ?? "—"} />
              <KV label="Business type" value={org.signup_intention ?? "—"} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                onClick={handleCopyId}
              >
                {idCopied ? (
                  <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {idCopied ? "Copied" : "Copy ID"}
              </button>
              {org.slug ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  onClick={() => copyToClipboard(org.slug!)}
                >
                  <Copy className="h-3 w-3" /> Copy slug
                </button>
              ) : null}
              {org.slug ? (
                <a
                  href={`https://${org.slug}.getstampd.com.au`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                  <ExternalLink className="h-3 w-3" /> Open tenant
                </a>
              ) : null}
            </div>

            <Section title="Plan & subscription">
              {planLoading && !planLimits ? (
                <div className="text-xs text-[#64748B]">Loading plan…</div>
              ) : planError ? (
                <div className="text-xs text-[#991B1B]">{planError}</div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">
                        Effective plan
                      </div>
                      {(() => {
                        const source = planLimits?.plan_source ?? "default";
                        const labelMap: Record<string, { label: string; cls: string }> = {
                          manual_override: {
                            label: "Manual override",
                            cls: "bg-[#FEF3C7] text-[#92400E]",
                          },
                          subscription: {
                            label: "Subscription",
                            cls: "bg-[#DCFCE7] text-[#166534]",
                          },
                          default: {
                            label: "Default",
                            cls: "bg-[#F1F5F9] text-[#475569]",
                          },
                        };
                        const meta = labelMap[source] ?? labelMap.default;
                        return (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
                          >
                            Source: {meta.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#0F172A]">
                      {getPlanByCode(planLimits?.plan_code).name}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#0F172A]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Venues</div>
                        <div>{planLimits?.venue_limit ?? "Unlimited"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Active events</div>
                        <div>{planLimits?.active_event_limit ?? "Unlimited"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Passports</div>
                        <div>{planLimits?.passport_limit ?? "Unlimited"}</div>
                      </div>
                    </div>
                  </div>


                  <div className="rounded-[10px] border border-[#E6ECF4] bg-white p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">
                      Subscription row
                    </div>
                    {subscription ? (
                      <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-[#0F172A]">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Plan code</div>
                          <div>{subscription.plan_code ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Status</div>
                          <div>{statusPill(subscription.status)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Period end</div>
                          <div>{fmtDate(subscription.current_period_end)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#64748B]">Trial ends</div>
                          <div>{fmtDate(subscription.trial_ends_at)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-[#64748B]">
                        No subscription row. Effective plan is Free.
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[#0F172A] sm:grid-cols-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[#64748B]">
                          Stripe customer
                        </div>
                        <code className="break-all text-[11px] text-[#0F172A]">
                          {stripeCustomerId ?? "—"}
                        </code>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[#64748B]">
                          Stripe subscription
                        </div>
                        <code className="break-all text-[11px] text-[#0F172A]">
                          {subscription?.stripe_subscription_id ?? "—"}
                        </code>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[10px] border border-[#FCD34D] bg-[#FFFBEB] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#92400E]">
                      Platform admin manual plan override
                    </div>
                    <p className="mt-1 text-[11px] text-[#92400E]">
                      Set a manual plan when this customer is invoiced
                      directly. The manual override takes priority over the
                      Stripe subscription for feature gating
                      (override → subscription → free).
                    </p>
                    <div className="mt-2 rounded-[8px] border border-[#FDE68A] bg-white p-2 text-[11px] text-[#0F172A]">
                      <div>
                        <span className="text-[#64748B]">Current override: </span>
                        <span className="font-medium">
                          {override?.manual_plan_override
                            ? getPlanByCode(override.manual_plan_override).name
                            : "None"}
                        </span>
                      </div>
                      {override?.manual_plan_override_at ? (
                        <div className="mt-0.5 text-[10px] text-[#64748B]">
                          Set {fmtDateTime(override.manual_plan_override_at)}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                      <div>
                        <label className="text-[11px] font-medium text-[#0F172A]">Plan</label>
                        <Select
                          value={overrideForm}
                          onValueChange={(v) => setOverrideForm(v)}
                        >
                          <SelectTrigger className="mt-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="growth">Growth</SelectItem>
                            <SelectItem value="regional">Regional</SelectItem>
                            <SelectItem value="pro_region">Pro Region</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveOverride}
                        disabled={saving || planLoading}
                        className="inline-flex items-center gap-1 rounded-[8px] bg-[#1F56C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1A48A8] disabled:opacity-60"
                      >
                        {saving ? "Saving…" : "Save manual override"}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearOverride}
                        disabled={clearing || planLoading || !override?.manual_plan_override}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-[#FCA5A5] bg-white px-3 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {clearing ? "Clearing…" : "Clear manual override"}
                      </button>
                      <button
                        type="button"
                        onClick={() => org && loadPlan(org.agency_id)}
                        disabled={planLoading}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
                      >
                        <RefreshCw className="h-3 w-3" /> Refresh plan
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </Section>



            <Section title={`Events (${events?.length ?? 0})`}>
              {loading && !events ? (
                <div className="text-xs text-[#64748B]">Loading…</div>
              ) : !events || events.length === 0 ? (
                <div className="text-xs text-[#64748B]">No events.</div>
              ) : (
                <ul className="divide-y divide-[#EEF2F7]">
                  {events.map((e) => (
                    <li key={e.event_id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="font-medium text-[#0F172A]">{e.event_name}</div>
                        <div className="text-[11px] text-[#64748B]">
                          {fmtNum(e.checkin_count)} check-ins · {fmtNum(e.passport_count)} passports
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusPill(e.status)}
                        <Link
                          to="/admin/events/$eventId"
                          params={{ eventId: e.event_id }}
                          className="text-xs font-medium text-[#1F56C5] hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Members (${users?.length ?? 0})`}>
              {loading && !users ? (
                <div className="text-xs text-[#64748B]">Loading…</div>
              ) : !users || users.length === 0 ? (
                <div className="text-xs text-[#64748B]">No members.</div>
              ) : (
                <ul className="divide-y divide-[#EEF2F7]">
                  {users.map((u, i) => {
                    const memberType = formatMemberType(u);
                    const isSelf = !!currentUserId && u.user_id === currentUserId;
                    const email = u.email ?? u.invited_email ?? "—";
                    return (
                      <li
                        key={`${u.user_id ?? u.invited_email}-${i}`}
                        className="flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[#0F172A]">{email}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="inline-flex rounded-full bg-[#EAF2FF] px-2 py-0.5 text-[10px] font-medium text-[#1F56C5]">
                              {memberType}
                            </span>
                            <span className="text-[10px] text-[#94A3B8]">
                              Joined {fmtDate(u.accepted_at ?? u.invited_at ?? u.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {u.accepted_at || u.scope === "platform"
                            ? statusPill("active")
                            : statusPill("draft")}
                          {u.user_id ? (
                            <button
                              type="button"
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? "You cannot delete your own account"
                                  : "Delete user"
                              }
                              onClick={() =>
                                setDeleteTarget({
                                  user_id: u.user_id!,
                                  email: u.email ?? u.invited_email,
                                  member_type: memberType,
                                  agency_names: org.name ? [org.name] : [],
                                })
                              }
                              className="inline-flex items-center justify-center rounded-[8px] border border-[#FECACA] bg-white p-1.5 text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </>
        ) : null}
      </SheetContent>
      <DeleteUserDialog
        target={deleteTarget}
        currentUserId={currentUserId}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => setRefreshTick((t) => t + 1)}
      />
    </Sheet>
  );
}


// -------- Users ----------------------------------------------------------

function UsersSection() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteUserTarget | null>(null);
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;


  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_users");
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope !== "all" && r.scope !== scope) return false;
      if (role !== "all" && r.role !== role) return false;
      if (!needle) return true;
      return (
        (r.email ?? "").toLowerCase().includes(needle) ||
        (r.agency_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, scope, role]);

  const roleOptions = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    rows.forEach((r) => r.role && set.add(r.role));
    return Array.from(set);
  }, [rows]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            placeholder="Search by email or organisation"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="platform">Platform</SelectItem>
            <SelectItem value="organisation">Organisation</SelectItem>
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roleOptions.map((r) => (
              <SelectItem key={r} value={r}>
                {formatRoleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-[#64748B]">
          {rows ? `${fmtNum(filtered.length)} of ${fmtNum(rows.length)}` : ""}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Email</TableHead>
              <TableHead>Member type</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined / invited</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={7} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-[#64748B]">
                  No users match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, idx) => {
                const status =
                  r.scope === "platform"
                    ? "active"
                    : r.accepted_at
                      ? "active"
                      : "pending invite";
                const memberType = formatMemberType(r);
                const isSelf = !!currentUserId && r.user_id === currentUserId;
                return (
                  <TableRow
                    key={`${r.user_id ?? r.invited_email ?? "row"}-${r.role}-${idx}`}
                    className="cursor-pointer hover:bg-[#F8FBFF]"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="text-sm text-[#0F172A]">
                      {r.email ?? r.invited_email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          memberType === "Pending Invite"
                            ? "bg-[#FEF3C7] text-[#92400E]"
                            : memberType === "Platform Admin"
                              ? "bg-[#FEE2E2] text-[#991B1B]"
                              : memberType === "Owner"
                                ? "bg-[#DCFCE7] text-[#166534]"
                                : "bg-[#EAF2FF] text-[#1F56C5]"
                        }`}
                      >
                        {memberType}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569]">
                        {formatRoleLabel(r.role)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-[#0F172A]">
                      {r.agency_name ?? (r.scope === "platform" ? "— (platform)" : "—")}
                    </TableCell>
                    <TableCell>
                      {status === "active" ? statusPill("active") : statusPill("draft")}
                    </TableCell>
                    <TableCell className="text-sm text-[#64748B]">
                      {fmtDate(r.accepted_at ?? r.invited_at ?? r.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.user_id ? (
                        <button
                          type="button"
                          disabled={isSelf}
                          title={isSelf ? "You cannot delete your own account" : "Delete user"}
                          onClick={(e) => {
                            e.stopPropagation();
                            const agencyNames = (rows ?? [])
                              .filter(
                                (x) => x.user_id === r.user_id && x.agency_name,
                              )
                              .map((x) => x.agency_name as string);
                            setDeleteTarget({
                              user_id: r.user_id!,
                              email: r.email ?? r.invited_email,
                              member_type: memberType,
                              agency_names: Array.from(new Set(agencyNames)),
                            });
                          }}
                          className="inline-flex items-center justify-center rounded-[8px] border border-[#FECACA] bg-white p-1.5 text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <UserAuthDiagnosticsCard />
      <PendingOrganisationSignupsCard />
      <OrphanAuthUsersCard />

      <UserDetailDrawer user={selected} allRows={rows} onClose={() => setSelected(null)} />
      <DeleteUserDialog
        target={deleteTarget}
        currentUserId={currentUserId}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  );
}

function PendingOrganisationSignupsCard() {
  const [rows, setRows] = useState<PendingOrganisationSignupRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_pending_organisation_signups");
    if (error) {
      setError(
        isMissingFn(error)
          ? "Pending signup RPCs are not installed yet. Apply supabase/migrations-pending-organisation-signups/apply.sql in the Supabase SQL editor."
          : error.message,
      );
      setLoading(false);
      return;
    }
    setRows((data ?? []) as PendingOrganisationSignupRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b bg-[#F8FAFC] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0F172A]">Pending signups</h3>
          <p className="mt-0.5 text-xs text-[#64748B]">
            Organisation details captured before email confirmation and completed after sign-in.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-[#F8FAFC]"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Email</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Business type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={6} />
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-xs text-[#64748B]">
                  No pending signups.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm text-[#0F172A]">{r.email}</TableCell>
                  <TableCell className="text-sm text-[#0F172A]">
                    <div>{r.organisation_name}</div>
                    {r.organisation_slug ? (
                      <code className="text-[11px] text-[#64748B]">{r.organisation_slug}</code>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-[#64748B]">
                    {r.signup_intention ?? "—"}
                  </TableCell>
                  <TableCell>{statusPill(r.status)}</TableCell>
                  <TableCell className="text-xs text-[#64748B]">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-[#991B1B]">
                    {r.last_error ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

type OrphanAuthUserRow = {
  user_id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

function OrphanAuthUsersCard() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const [rows, setRows] = useState<OrphanAuthUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrphanAuthUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_orphan_auth_users");
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as OrphanAuthUserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc("system_admin_delete_orphan_auth_user", {
      _user_id: deleteTarget.user_id,
    });
    setDeleting(false);
    if (error) {
      console.warn("[orphan-delete] failed", { code: error.code, message: error.message });
      const msg = error.message ?? "";
      let friendly = "Could not delete this user. Please try again.";
      if (msg.includes("cannot_delete_self")) {
        friendly = "You cannot delete your own account from this list.";
      } else if (msg.includes("orphan_user_not_found_or_no_longer_orphaned")) {
        friendly =
          "This user is no longer orphaned (they now have a role or organisation membership) or no longer exists. The list will refresh.";
      } else if (isMissingFn(error)) {
        friendly = MISSING_RPC_HINT;
      }
      setDeleteError(friendly);
      // Refresh list — state may have changed server-side.
      await load();
      return;
    }
    setDeleteTarget(null);
    await load();
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b bg-[#FFFBEB] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#92400E]">Auth-only users (orphans)</h3>
          <p className="mt-0.5 text-xs text-[#A16207]">
            Accounts that exist in Supabase Auth but have no platform role and no
            organisation membership. They can sign in but have nowhere to land —
            usually users who started signup and never finished creating an organisation.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-[#FEF3C7]"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Email</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Email confirmed</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={5} />
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-xs text-[#64748B]">
                  No orphan auth users. 🎉
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const isSelf = !!currentUserId && r.user_id === currentUserId;
                return (
                  <TableRow key={r.user_id}>
                    <TableCell className="text-sm text-[#0F172A]">{r.email ?? "—"}</TableCell>
                    <TableCell className="text-xs text-[#64748B]">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B]">
                      {r.email_confirmed_at ? new Date(r.email_confirmed_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B]">
                      {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(r);
                        }}
                        title={isSelf ? "You cannot delete your own account" : "Delete this auth-only user"}
                        className="rounded-md border border-[#FECACA] bg-white px-2 py-1 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#991B1B]">
              Delete this auth-only user?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-[#475569]">
                <p>
                  This will permanently remove their login account. This should
                  only be used for test or abandoned signup accounts.
                </p>
                {deleteTarget?.email ? (
                  <p className="rounded-md bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#0F172A]">
                    {deleteTarget.email}
                  </p>
                ) : null}
                {deleteError ? (
                  <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
                    {deleteError}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleting}
              className="bg-[#B91C1C] hover:bg-[#991B1B]"
            >
              {deleting ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}



function UserDetailDrawer({
  user,
  allRows,
  onClose,
}: {
  user: UserRow | null;
  allRows: UserRow[] | null;
  onClose: () => void;
}) {
  const memberships = useMemo(() => {
    if (!user || !allRows) return [];
    const key = user.user_id ?? user.invited_email;
    if (!key) return [];
    return allRows.filter((r) => (r.user_id ?? r.invited_email) === key);
  }, [user, allRows]);

  return (
    <Sheet open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {user ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#1F56C5]" />
                {user.email ?? user.invited_email ?? "Unknown user"}
              </SheetTitle>
              <SheetDescription>
                {formatRoleLabel(user.role)}
                {user.scope === "platform" ? " · Platform" : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <KV label="Status" value={user.accepted_at || user.scope === "platform" ? statusPill("active") : statusPill("draft")} />
              <KV label="Scope" value={user.scope} />
              <KV label="Organisation" value={user.agency_name ?? "—"} />
              <KV label="Invited" value={fmtDate(user.invited_at)} />
              <KV label="Joined" value={fmtDate(user.accepted_at)} />
              <KV label="Created" value={fmtDate(user.created_at)} />
            </div>

            <Section title={`All memberships (${memberships.length})`}>
              {memberships.length === 0 ? (
                <div className="text-xs text-[#64748B]">No additional memberships.</div>
              ) : (
                <ul className="divide-y divide-[#EEF2F7]">
                  {memberships.map((m, i) => (
                    <li key={i} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="text-[#0F172A]">{m.agency_name ?? "— (platform)"}</div>
                        <div className="text-[11px] text-[#64748B]">{formatRoleLabel(m.role)}</div>
                      </div>
                      {m.accepted_at || m.scope === "platform" ? statusPill("active") : statusPill("draft")}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="mt-4 text-[11px] text-[#94A3B8]">
              Inspect-only. Role and membership mutations are not available from this view.
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// -------- User auth diagnostics (platform admin only) --------------------

type AuthUserSummary = {
  user_id: string;
  email: string | null;
  created_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  confirmation_sent_at: string | null;
  invited_at: string | null;
  recovery_sent_at: string | null;
  email_change: string | null;
  email_change_sent_at: string | null;
  phone: string | null;
  phone_confirmed_at: string | null;
  banned_until: string | null;
  provider: string | null;
  providers: string[] | null;
  is_platform_admin: boolean;
  has_organisation: boolean;
  agency_id: string | null;
  agency_name: string | null;
  agency_role: string | null;
  accepted_at: string | null;
  invited_member_at: string | null;
};

type AuthTimelineRow = {
  occurred_at: string;
  event_type: string;
  status: string | null;
  summary: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
};

type AuthEmailDiagnostics = {
  user_exists: boolean;
  user_id?: string;
  email?: string | null;
  created_at?: string | null;
  email_confirmed?: boolean;
  email_confirmed_at?: string | null;
  confirmation_sent_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  likely_issue?: string;
  recommended_next_action?: string;
};

function DiagBadge({ tone, children }: { tone: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-[#DCFCE7] text-[#166534]"
      : tone === "warn"
        ? "bg-[#FEF3C7] text-[#92400E]"
        : tone === "bad"
          ? "bg-[#FEE2E2] text-[#991B1B]"
          : "bg-[#EAF2FF] text-[#1F56C5]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function UserAuthDiagnosticsCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthUserSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuthUserSummary | null>(null);
  const [timeline, setTimeline] = useState<AuthTimelineRow[] | null>(null);
  const [diag, setDiag] = useState<AuthEmailDiagnostics | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<
    { tone: "ok" | "bad"; text: string } | null
  >(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const needle = query.trim();
    if (!needle) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    const { data, error } = await supabase.rpc("system_admin_find_auth_user", { p_search: needle });
    if (error) {
      setSearchError(
        isMissingFn(error)
          ? "User auth diagnostics RPCs are not installed yet. Apply supabase/migrations-system-admin-user-auth-diagnostics/apply.sql."
          : error.message,
      );
      setSearching(false);
      return;
    }
    setResults((data ?? []) as AuthUserSummary[]);
    setSearching(false);
  };

  const loadDetails = async (userId: string) => {
    const [tl, dg] = await Promise.all([
      supabase.rpc("system_admin_user_auth_timeline", { p_user_id: userId }),
      supabase.rpc("system_admin_auth_email_diagnostics", { p_user_id: userId }),
    ]);
    if (tl.error) {
      setDetailError(tl.error.message);
    } else {
      const rows = (tl.data ?? []) as AuthTimelineRow[];
      rows.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
      setTimeline(rows);
      setDetailError(null);
    }
    if (!dg.error) {
      setDiag(dg.data as AuthEmailDiagnostics);
    }
  };

  const openUser = async (user: AuthUserSummary) => {
    setSelected(user);
    setDetailLoading(true);
    setDetailError(null);
    setTimeline(null);
    setDiag(null);
    setResendMessage(null);
    await loadDetails(user.user_id);
    setDetailLoading(false);
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const { data } = await supabase.rpc("system_admin_find_auth_user", {
      p_search: selected.user_id,
    });
    const rows = (data ?? []) as AuthUserSummary[];
    const fresh = rows.find((r) => r.user_id === selected.user_id);
    if (fresh) setSelected(fresh);
    await loadDetails(selected.user_id);
  };

  const handleResendVerification = async () => {
    if (!selected?.email) return;
    setResending(true);
    setResendMessage(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: selected.email,
      options: {
        emailRedirectTo: authUrl("/admin/login?complete_signup=1"),
      },
    });
    if (error) {
      const code = (error as { status?: number; code?: string }).status
        ?? (error as { code?: string }).code;
      setResendMessage({
        tone: "bad",
        text: code ? `${error.message} (${code})` : error.message,
      });
      toast.error("Resend failed");
      setResending(false);
      return;
    }
    // Best-effort audit log (do not fail the UX if the RPC isn't installed).
    const { error: logErr } = await supabase.rpc("system_admin_log_support_action", {
      p_action: "auth_verification_email_resent",
      p_target_user_id: selected.user_id,
      p_target_email: selected.email,
      p_source: "system_admin_user_auth_diagnostics",
      p_metadata: {
        redirect_to: authUrl("/admin/login?complete_signup=1"),
      },
    });
    if (logErr && !isMissingFn(logErr)) {
      // Non-fatal; surface in console only.
      console.warn("[support-action log] failed", logErr.message);
    }
    setResendMessage({
      tone: "ok",
      text:
        "Verification email resent. This confirms Supabase accepted the resend request, but it does not prove inbox delivery.",
    });
    toast.success("Verification email resent");
    setResendCooldown(60);
    setResending(false);
    await refreshSelected();
  };


  const copySummary = async () => {
    if (!selected) return;
    const lines = [
      `User: ${selected.email ?? selected.user_id}`,
      `User ID: ${selected.user_id}`,
      `Signed up: ${fmtDateTime(selected.created_at)}`,
      `Email confirmed: ${selected.email_confirmed_at ? `yes (${fmtDateTime(selected.email_confirmed_at)})` : "no"}`,
      `Confirmation sent: ${fmtDateTime(selected.confirmation_sent_at)}`,
      `Last login: ${selected.last_sign_in_at ? fmtDateTime(selected.last_sign_in_at) : "never"}`,
      `Organisation: ${selected.agency_name ?? "—"} (${selected.has_organisation ? selected.agency_role ?? "member" : "none"})`,
      `Platform admin: ${selected.is_platform_admin ? "yes" : "no"}`,
      `Likely issue: ${diag?.likely_issue ?? "—"}`,
      `Recommended next action: ${diag?.recommended_next_action ?? "—"}`,
    ];
    await copyToClipboard(lines.join("\n"));
    toast.success("Diagnostic summary copied");
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">User auth diagnostics</div>
          <div className="mt-0.5 text-xs text-[#64748B]">
            Search any user by email or user ID to inspect signup, email confirmation, and login state. Platform admin only.
          </div>
        </div>
      </div>

      <form onSubmit={runSearch} className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            placeholder="Search by email or user ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>

      {searchError ? (
        <div className="mt-3"><ErrorBanner message={searchError} /></div>
      ) : null}

      {results && results.length === 0 ? (
        <div className="mt-3 rounded-[12px] border border-dashed border-[#CBD5E1] bg-white p-4 text-sm text-[#64748B]">
          No users match that search.
        </div>
      ) : null}

      {results && results.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-[12px] border border-[#E6ECF4]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAFC]">
                <TableHead>Email</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>Email confirmed</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead className="w-[80px] text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((u) => (
                <TableRow
                  key={u.user_id}
                  className="cursor-pointer hover:bg-[#F8FBFF]"
                  onClick={() => openUser(u)}
                >
                  <TableCell className="text-sm text-[#0F172A]">{u.email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-[#64748B]">{fmtDate(u.created_at)}</TableCell>
                  <TableCell>
                    {u.email_confirmed_at ? (
                      <DiagBadge tone="ok">Confirmed</DiagBadge>
                    ) : (
                      <DiagBadge tone="warn">Not confirmed</DiagBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.last_sign_in_at ? (
                      <span className="text-sm text-[#64748B]">{fmtDate(u.last_sign_in_at)}</span>
                    ) : (
                      <DiagBadge tone="info">Never logged in</DiagBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-[#0F172A]">
                    {u.has_organisation ? (
                      u.agency_name ?? "—"
                    ) : (
                      <DiagBadge tone="warn">Missing organisation</DiagBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openUser(u); }}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.email ?? "Auth user"}</SheetTitle>
                <SheetDescription className="break-all">{selected.user_id}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {selected.email_confirmed_at ? (
                  <DiagBadge tone="ok">Confirmed</DiagBadge>
                ) : (
                  <DiagBadge tone="warn">Not confirmed</DiagBadge>
                )}
                {selected.last_sign_in_at ? (
                  <DiagBadge tone="ok">Has logged in</DiagBadge>
                ) : (
                  <DiagBadge tone="info">Never logged in</DiagBadge>
                )}
                {selected.has_organisation ? (
                  <DiagBadge tone="ok">Has organisation</DiagBadge>
                ) : (
                  <DiagBadge tone="warn">Missing organisation</DiagBadge>
                )}
                {selected.is_platform_admin ? <DiagBadge tone="bad">Platform admin</DiagBadge> : null}
                {selected.agency_role === "agency_owner" || selected.agency_role === "agency_admin" ? (
                  <DiagBadge tone="info">Org admin</DiagBadge>
                ) : null}
                {selected.banned_until ? <DiagBadge tone="bad">Banned</DiagBadge> : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[12px] border border-[#E6ECF4] p-3">
                  <div className="text-[11px] uppercase tracking-wide text-[#64748B]">Signed up</div>
                  <div className="mt-1 text-sm text-[#0F172A]">{fmtDateTime(selected.created_at)}</div>
                </div>
                <div className="rounded-[12px] border border-[#E6ECF4] p-3">
                  <div className="text-[11px] uppercase tracking-wide text-[#64748B]">Email confirmed</div>
                  <div className="mt-1 text-sm text-[#0F172A]">{fmtDateTime(selected.email_confirmed_at)}</div>
                </div>
                <div className="rounded-[12px] border border-[#E6ECF4] p-3">
                  <div className="text-[11px] uppercase tracking-wide text-[#64748B]">Last login</div>
                  <div className="mt-1 text-sm text-[#0F172A]">{fmtDateTime(selected.last_sign_in_at)}</div>
                </div>
                <div className="rounded-[12px] border border-[#E6ECF4] p-3">
                  <div className="text-[11px] uppercase tracking-wide text-[#64748B]">Organisation</div>
                  <div className="mt-1 text-sm text-[#0F172A]">
                    {selected.agency_name ?? "—"}
                    {selected.agency_role ? (
                      <span className="ml-1 text-xs text-[#64748B]">({formatRoleLabel(selected.agency_role)})</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#64748B]">Confirmation sent: </span>
                  <span className="text-[#0F172A]">{fmtDateTime(selected.confirmation_sent_at)}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Invited: </span>
                  <span className="text-[#0F172A]">{fmtDateTime(selected.invited_at)}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Recovery sent: </span>
                  <span className="text-[#0F172A]">{fmtDateTime(selected.recovery_sent_at)}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Email change sent: </span>
                  <span className="text-[#0F172A]">{fmtDateTime(selected.email_change_sent_at)}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Phone confirmed: </span>
                  <span className="text-[#0F172A]">{fmtDateTime(selected.phone_confirmed_at)}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Provider: </span>
                  <span className="text-[#0F172A]">
                    {selected.providers && selected.providers.length > 0
                      ? selected.providers.join(", ")
                      : selected.provider ?? "—"}
                  </span>
                </div>
              </div>

              {diag?.likely_issue ? (
                <div className="mt-4 rounded-[12px] border border-[#FDE68A] bg-[#FFFBEB] p-3 text-sm text-[#78350F]">
                  <div className="font-semibold">Likely issue</div>
                  <div className="mt-0.5">{diag.likely_issue}</div>
                  {diag.recommended_next_action ? (
                    <div className="mt-2">
                      <span className="font-semibold">Next action:</span> {diag.recommended_next_action}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!selected.email_confirmed_at && selected.email ? (
                <div className="mt-4 rounded-[12px] border border-[#E6ECF4] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#0F172A]">
                      Resend verification email
                    </div>
                    <Button
                      size="sm"
                      onClick={handleResendVerification}
                      disabled={resending || resendCooldown > 0}
                    >
                      <MailCheck className="mr-1 h-3.5 w-3.5" />
                      {resending
                        ? "Resending…"
                        : resendCooldown > 0
                          ? `Wait ${resendCooldown}s`
                          : "Resend verification email"}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-[#64748B]">
                    Resend requests confirm that Supabase accepted the email send request.
                    Delivery depends on SMTP/provider configuration, recipient mail filtering,
                    and domain authentication. For reliable delivery and provider logs, configure
                    custom SMTP.
                  </div>
                  {resendMessage ? (
                    <div
                      className={
                        "mt-2 rounded-[8px] border p-2 text-xs " +
                        (resendMessage.tone === "ok"
                          ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
                          : "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]")
                      }
                    >
                      {resendMessage.text}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-[#0F172A]">Auth timeline</div>
                <Button variant="outline" size="sm" onClick={copySummary}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy summary
                </Button>
              </div>

              {detailLoading ? (
                <div className="mt-2 text-sm text-[#64748B]">Loading timeline…</div>
              ) : detailError ? (
                <div className="mt-2"><ErrorBanner message={detailError} /></div>
              ) : timeline && timeline.length > 0 ? (
                <ol className="mt-2 space-y-2">
                  {timeline.map((t, i) => (
                    <li key={i} className="rounded-[12px] border border-[#E6ECF4] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-[#0F172A]">{t.event_type}</div>
                        <div className="text-xs text-[#64748B]">{fmtDateTime(t.occurred_at)}</div>
                      </div>
                      {t.summary ? <div className="mt-0.5 text-xs text-[#475569]">{t.summary}</div> : null}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#64748B]">
                        {t.status ? <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5">{t.status}</span> : null}
                        {t.source ? <span>{t.source}</span> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-2 rounded-[12px] border border-dashed border-[#CBD5E1] p-3 text-xs text-[#64748B]">
                  No auth timeline entries available. Supabase's <code>auth.audit_log_entries</code> may be empty or unavailable on this project.
                </div>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

// -------- Events ----------------------------------------------------------


function EventsSection({
  filter,
  setFilter,
}: {
  filter: EventsFilter;
  setFilter: (f: EventsFilter) => void;
}) {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [agencyId, setAgencyId] = useState<string>("all");
  const [selected, setSelected] = useState<EventRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_events");
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as EventRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const orgOptions = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.agency_id, r.agency_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const now = Date.now();
    const recentMs =
      filter.recent === "24h" ? 24 * 60 * 60 * 1000
      : filter.recent === "7d" ? 7 * 24 * 60 * 60 * 1000
      : null;

    let list = rows.filter((r) => {
      if (filter.status !== "all" && r.status !== filter.status) return false;
      if (agencyId !== "all" && r.agency_id !== agencyId) return false;
      if (recentMs !== null) {
        if (!r.last_checkin_at) return false;
        if (now - new Date(r.last_checkin_at).getTime() > recentMs) return false;
      }
      if (!needle) return true;
      return (
        r.event_name.toLowerCase().includes(needle) ||
        r.agency_name.toLowerCase().includes(needle) ||
        (r.public_slug ?? "").toLowerCase().includes(needle)
      );
    });

    if (filter.sort === "checkins") list = [...list].sort((a, b) => b.checkin_count - a.checkin_count);
    else if (filter.sort === "passports") list = [...list].sort((a, b) => b.passport_count - a.passport_count);
    else if (filter.sort === "recent") {
      list = [...list].sort((a, b) => {
        const at = a.last_checkin_at ? new Date(a.last_checkin_at).getTime() : 0;
        const bt = b.last_checkin_at ? new Date(b.last_checkin_at).getTime() : 0;
        return bt - at;
      });
    }
    return list;
  }, [rows, q, filter, agencyId]);

  const publicUrlFor = (r: EventRow): string | null => {
    if (r.custom_domain) return `https://${r.custom_domain}`;
    if (r.public_subdomain) return tenantUrl(r.public_subdomain);
    if (r.public_slug && r.agency_slug) {
      return `https://www.getstampd.com.au/t/${r.agency_slug}/e/${r.public_slug}`;
    }
    return null;
  };

  const [archiveTarget, setArchiveTarget] = useState<EventRow | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<EventRow | null>(null);
  const [subdomainRefreshKey, setSubdomainRefreshKey] = useState(0);
  const onArchived = () => {
    setArchiveTarget(null);
    setSelected(null);
    setSubdomainRefreshKey((k) => k + 1);
    load();
  };
  const onHardDeleted = () => {
    setHardDeleteTarget(null);
    setSelected(null);
    setSubdomainRefreshKey((k) => k + 1);
    load();
  };

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const chips: { label: string; clear: () => void }[] = [];
  if (filter.status !== "all") chips.push({ label: `${filter.status} events`, clear: () => setFilter({ ...filter, status: "all" }) });
  if (filter.recent !== "all") chips.push({ label: `check-ins last ${filter.recent}`, clear: () => setFilter({ ...filter, recent: "all" }) });
  if (filter.sort !== "default") chips.push({ label: `sorted by ${filter.sort}`, clear: () => setFilter({ ...filter, sort: "default" }) });

  return (
    <div className="space-y-3">
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c, i) => <FilterChip key={i} label={c.label} onClear={c.clear} />)}
          <button
            type="button"
            onClick={() => setFilter(DEFAULT_EVENTS_FILTER)}
            className="text-xs text-[#1F56C5] hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            placeholder="Search by event or organisation"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v as EventsFilter["status"] })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agencyId} onValueChange={setAgencyId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisations</SelectItem>
            {orgOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.recent} onValueChange={(v) => setFilter({ ...filter, recent: v as EventsFilter["recent"] })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Recent activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="24h">Check-ins last 24h</SelectItem>
            <SelectItem value="7d">Check-ins last 7d</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-[#64748B]">
          {rows ? `${fmtNum(filtered.length)} of ${fmtNum(rows.length)}` : ""}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Event</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Public URL</TableHead>
              <TableHead className="text-right">Venues</TableHead>
              <TableHead className="text-right">Passports</TableHead>
              <TableHead className="text-right">Check-ins</TableHead>
              <TableHead>Last check-in</TableHead>
              <TableHead>Days archived</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={10} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-[#64748B]">
                  No events match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const publicUrl = publicUrlFor(r);
                return (
                  <TableRow
                    key={r.event_id}
                    className="cursor-pointer hover:bg-[#F8FBFF]"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell>
                      <div className="font-medium text-[#0F172A]">{r.event_name}</div>
                      <div className="text-xs text-[#64748B]">
                        Created {fmtDate(r.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-[#0F172A]">{r.agency_name}</TableCell>
                    <TableCell>
                      {statusPill(r.status)}
                      {r.activation_status ? (
                        <div className="mt-1">{statusPill(r.activation_status)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      {r.public_subdomain ? (
                        <div className="font-mono text-[#0F172A]">
                          {r.public_subdomain}
                          <span className="text-[#94A3B8]">.getstampd.com.au</span>
                        </div>
                      ) : r.custom_domain ? (
                        <div className="font-mono text-[#0F172A]">{r.custom_domain}</div>
                      ) : publicUrl ? (
                        <div className="truncate font-mono text-[#64748B]" title={publicUrl}>
                          {publicUrl.replace(/^https?:\/\//, "")}
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                      {r.public_slug ? (
                        <div className="mt-0.5 text-[10px] text-[#94A3B8]">
                          slug: <span className="font-mono">{r.public_slug}</span>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(r.venue_count)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(r.passport_count)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(r.checkin_count)}</TableCell>
                    <TableCell className="text-sm text-[#64748B]">
                      {fmtDateTime(r.last_checkin_at)}
                    </TableCell>
                    <TableCell className="text-sm text-[#64748B]">
                      {formatDaysArchived(r.days_since_archived)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Link
                          to="/admin/events/$eventId"
                          params={{ eventId: r.event_id }}
                          className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                          title="Open event admin"
                        >
                          Open
                        </Link>
                        {publicUrl ? (
                          <>
                            <a
                              href={publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                              title="Open public event page"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(publicUrl)}
                              className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                              title="Copy public URL"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </>
                        ) : null}
                        {r.deleted_at == null ? (
                          <button
                            type="button"
                            onClick={() => setArchiveTarget(r)}
                            className="inline-flex items-center gap-1 rounded-[8px] border border-[#FECACA] bg-white px-2 py-1 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                            title="Archive event"
                          >
                            <Archive className="h-3 w-3" />
                          </button>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-[8px] border border-[#E6ECF4] bg-[#F8FAFC] px-2 py-1 text-[10px] uppercase text-[#64748B]">
                              archived
                            </span>
                            <button
                              type="button"
                              onClick={() => setHardDeleteTarget(r)}
                              className="inline-flex items-center gap-1 rounded-[8px] border border-[#DC2626] bg-[#DC2626] px-2 py-1 text-xs font-medium text-white hover:bg-[#B91C1C]"
                              title="Delete forever"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <EventDetailDrawer
        event={selected}
        publicUrl={selected ? publicUrlFor(selected) : null}
        onClose={() => setSelected(null)}
        onArchive={(r) => setArchiveTarget(r)}
        onHardDelete={(r) => setHardDeleteTarget(r)}
      />

      <ArchiveEventDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={onArchived}
      />

      <HardDeleteEventDialog
        target={hardDeleteTarget}
        publicUrl={hardDeleteTarget ? publicUrlFor(hardDeleteTarget) : null}
        onClose={() => setHardDeleteTarget(null)}
        onDeleted={onHardDeleted}
      />

      <SubdomainLookupCard key={`lookup-${subdomainRefreshKey}`} />
      <ActiveSubdomainsCard key={`active-${subdomainRefreshKey}`} />
      <DeletedSubdomainsCleanup key={`deleted-${subdomainRefreshKey}`} />
      <ReservedSubdomainsCard />
    </div>
  );
}

function DeletedSubdomainsCleanup() {
  type Row = {
    event_id: string;
    agency_id: string;
    agency_name: string;
    event_name: string;
    public_subdomain: string;
    domain_status: string;
    deleted_at: string;
  };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [clearingId, setClearingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc(
      "system_admin_deleted_events_with_subdomain",
    );
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setRows(null);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.public_subdomain.toLowerCase().includes(needle) ||
        r.event_name.toLowerCase().includes(needle) ||
        r.agency_name.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  async function clearSubdomain(r: Row) {
    if (
      !window.confirm(
        `Clear subdomain "${r.public_subdomain}" from deleted event "${r.event_name}"?\n\nThis releases the subdomain so a new event can claim it. The event record itself is kept for history.`,
      )
    )
      return;
    setClearingId(r.event_id);
    const { error } = await supabase.rpc("system_admin_clear_event_subdomain", {
      p_event_id: r.event_id,
    });
    setClearingId(null);
    if (error) {
      toast.error(`Could not clear subdomain: ${error.message}`);
      return;
    }
    toast.success(`Released ${r.public_subdomain}.`);
    load();
  }

  return (
    <Card className="border-[#E6ECF4] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">
            Released / old subdomains
          </div>
          <div className="text-xs text-[#64748B]">
            Deleted or archived events that still hold a subdomain. Clearing one
            frees the label for reuse by a new event.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search subdomain / event / org"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-64"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      {error ? (
        <ErrorBanner message={error} onRetry={load} />
      ) : loading && !rows ? (
        <div className="text-sm text-[#64748B]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-[#64748B]">
          No deleted events are holding a subdomain. Nothing to clean up.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subdomain</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={`${r.event_id}-${r.public_subdomain}`}>
                <TableCell className="font-mono text-xs">{r.public_subdomain}</TableCell>
                <TableCell>{r.event_name}</TableCell>
                <TableCell>{r.agency_name}</TableCell>
                <TableCell className="text-xs uppercase text-[#64748B]">
                  {r.domain_status}
                </TableCell>
                <TableCell className="text-xs text-[#64748B]">
                  {new Date(r.deleted_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clearSubdomain(r)}
                    disabled={clearingId === r.event_id}
                  >
                    {clearingId === r.event_id ? "Clearing…" : "Clear subdomain"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function EventDetailDrawer({
  event,
  publicUrl,
  onClose,
  onArchive,
  onHardDelete,
}: {
  event: EventRow | null;
  publicUrl: string | null;
  onClose: () => void;
  onArchive: (r: EventRow) => void;
  onHardDelete: (r: EventRow) => void;
}) {
  return (
    <Sheet open={!!event} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {event ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#1F56C5]" />
                {event.event_name}
              </SheetTitle>
              <SheetDescription>{event.agency_name}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <KV label="Status" value={statusPill(event.status)} />
              <KV label="Activation" value={event.activation_status ? statusPill(event.activation_status) : "—"} />
              <KV label="Starts" value={fmtDate(event.starts_at)} />
              <KV label="Ends" value={fmtDate(event.ends_at)} />
              <KV label="Created" value={fmtDate(event.created_at)} />
              <KV label="Last check-in" value={fmtDateTime(event.last_checkin_at)} />
              <KV label="Venues" value={fmtNum(event.venue_count)} />
              <KV label="Passports" value={fmtNum(event.passport_count)} />
              <KV label="Check-ins" value={fmtNum(event.checkin_count)} />
              <KV label="Archived" value={event.deleted_at ? fmtDateTime(event.deleted_at) : "—"} />
              <KV label="Days archived" value={formatDaysArchived(event.days_since_archived)} />
            </div>

            <div className="mt-5 rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3 text-xs">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                Public routing
              </div>
              <div className="space-y-1.5 text-[#0F172A]">
                <div>
                  <span className="text-[#64748B]">Subdomain: </span>
                  <span className="font-mono">{event.public_subdomain ?? "—"}</span>
                  {event.subdomain_status ? (
                    <span className="ml-2 text-[10px] uppercase text-[#64748B]">
                      ({event.subdomain_status})
                    </span>
                  ) : null}
                </div>
                {event.custom_domain ? (
                  <div>
                    <span className="text-[#64748B]">Custom domain: </span>
                    <span className="font-mono">{event.custom_domain}</span>
                  </div>
                ) : null}
                <div>
                  <span className="text-[#64748B]">Public slug: </span>
                  <span className="font-mono">{event.public_slug ?? "—"}</span>
                </div>
                <div className="break-all">
                  <span className="text-[#64748B]">Full URL: </span>
                  {publicUrl ? (
                    <a href={publicUrl} target="_blank" rel="noreferrer" className="font-mono text-[#1F56C5] hover:underline">
                      {publicUrl}
                    </a>
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/admin/events/$eventId"
                params={{ eventId: event.event_id }}
                className="inline-flex items-center gap-1 rounded-[8px] bg-[#1F56C5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1849A8]"
              >
                Open event admin
              </Link>
              {publicUrl ? (
                <>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    <ExternalLink className="h-3 w-3" /> Open public event
                  </a>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(publicUrl)}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    <Copy className="h-3 w-3" /> Copy public URL
                  </button>
                </>
              ) : null}
              {event.deleted_at == null ? (
                <button
                  type="button"
                  onClick={() => onArchive(event)}
                  className="ml-auto inline-flex items-center gap-1 rounded-[8px] border border-[#FECACA] bg-white px-3 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  <Archive className="h-3 w-3" /> Archive event
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onHardDelete(event)}
                  className="ml-auto inline-flex items-center gap-1 rounded-[8px] border border-[#DC2626] bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C]"
                >
                  <Trash2 className="h-3 w-3" /> Delete forever
                </button>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// -------- Archive event dialog --------------------------------------------

function ArchiveEventDialog({
  target,
  onClose,
  onArchived,
}: {
  target: EventRow | null;
  onClose: () => void;
  onArchived: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) setConfirm("");
  }, [target]);

  const ready = confirm.trim().toUpperCase() === "ARCHIVE";

  const handleArchive = async () => {
    if (!target || !ready) return;
    setBusy(true);
    const { error } = await supabase.rpc("system_admin_archive_event", {
      p_event_id: target.event_id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not archive event.");
      return;
    }
    toast.success(`Archived “${target.event_name}”.${target.public_subdomain ? ` Subdomain ${target.public_subdomain} released.` : ""}`);
    onArchived();
  };

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[#991B1B]">
            <Archive className="h-4 w-4" />
            Archive event
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-[#475569]">
              <p>
                This will remove the event from active admin/public views and
                release its public subdomain for future use. Events, venues,
                passports, check-ins and analytics records are preserved.
              </p>
              {target ? (
                <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3 text-xs text-[#0F172A]">
                  <div><span className="text-[#64748B]">Event: </span><span className="font-medium">{target.event_name}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Organisation: </span><span className="font-medium">{target.agency_name}</span></div>
                  {target.public_subdomain ? (
                    <div className="mt-1">
                      <span className="text-[#64748B]">Subdomain to release: </span>
                      <span className="font-mono font-medium">{target.public_subdomain}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div>
                <label className="text-[11px] font-medium text-[#0F172A]">
                  Type <code className="rounded bg-[#F1F5F9] px-1">ARCHIVE</code> to confirm
                </label>
                <Input
                  autoFocus
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="ARCHIVE"
                  className="mt-1"
                  disabled={busy}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready || busy}
            onClick={(e) => { e.preventDefault(); handleArchive(); }}
            className="bg-[#DC2626] text-white hover:bg-[#B91C1C]"
          >
            {busy ? "Archiving…" : "Archive event"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// -------- Days-archived helper --------------------------------------------

function formatDaysArchived(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// -------- Hard delete event dialog (platform admin only) ------------------

function HardDeleteEventDialog({
  target,
  publicUrl,
  onClose,
  onDeleted,
}: {
  target: EventRow | null;
  publicUrl: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) setConfirm("");
  }, [target]);

  const ready = confirm.trim().toUpperCase() === "DELETE FOREVER";

  const handleDelete = async () => {
    if (!target || !ready) return;
    setBusy(true);
    const { error } = await supabase.rpc("system_admin_hard_delete_event", {
      p_event_id: target.event_id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not delete event.");
      return;
    }
    toast.success("Event permanently deleted", {
      description: `${target.event_name} and its related records were removed.`,
    });
    onDeleted();
  };

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[#991B1B]">
            <Trash2 className="h-4 w-4" />
            Permanently delete event
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-[#475569]">
              <p>
                This will permanently delete this event and its related setup
                data from GetStampd. This action cannot be undone.
              </p>
              <p>
                Only use this for test events, duplicate events, or events that
                must be removed from the production database.
              </p>
              {target ? (
                <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3 text-xs text-[#0F172A]">
                  <div><span className="text-[#64748B]">Event: </span><span className="font-medium">{target.event_name}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Organisation: </span><span className="font-medium">{target.agency_name}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Status: </span><span className="font-medium">{target.status}</span></div>
                  <div className="mt-1 break-all">
                    <span className="text-[#64748B]">Public URL: </span>
                    <span className="font-mono">{publicUrl ?? "—"}</span>
                  </div>
                  <div className="mt-1"><span className="text-[#64748B]">Venues: </span><span className="font-medium">{fmtNum(target.venue_count)}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Passports: </span><span className="font-medium">{fmtNum(target.passport_count)}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Check-ins: </span><span className="font-medium">{fmtNum(target.checkin_count)}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Archived: </span><span className="font-medium">{target.deleted_at ? fmtDateTime(target.deleted_at) : "—"}</span></div>
                  <div className="mt-1"><span className="text-[#64748B]">Days archived: </span><span className="font-medium">{formatDaysArchived(target.days_since_archived)}</span></div>
                </div>
              ) : null}
              <div>
                <label className="text-[11px] font-medium text-[#0F172A]">
                  Type <code className="rounded bg-[#F1F5F9] px-1">DELETE FOREVER</code> to confirm
                </label>
                <Input
                  autoFocus
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="DELETE FOREVER"
                  className="mt-1"
                  disabled={busy}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready || busy}
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            className="bg-[#DC2626] text-white hover:bg-[#B91C1C]"
          >
            {busy ? "Deleting…" : "Delete forever"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// -------- Currently held subdomains (active events) -----------------------

function ActiveSubdomainsCard() {
  type Row = {
    event_id: string;
    agency_id: string;
    agency_name: string;
    event_name: string;
    status: string;
    public_subdomain: string;
    domain_status: string;
    created_at: string;
  };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("system_admin_active_events_with_subdomain");
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setRows(null);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.public_subdomain.toLowerCase().includes(needle) ||
        r.event_name.toLowerCase().includes(needle) ||
        r.agency_name.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <Card className="border-[#E6ECF4] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">
            Currently held subdomains
          </div>
          <div className="text-xs text-[#64748B]">
            Active, draft and published events that currently own a public
            subdomain. Archive an event to release its label for reuse.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search subdomain / event / org"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-64"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      {error ? (
        <ErrorBanner message={error} onRetry={load} />
      ) : loading && !rows ? (
        <div className="text-sm text-[#64748B]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-[#64748B]">
          No active events currently own a subdomain.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subdomain</TableHead>
              <TableHead>Full URL</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const url = tenantUrl(r.public_subdomain);
              return (
                <TableRow key={`${r.event_id}-${r.public_subdomain}`}>
                  <TableCell className="font-mono text-xs">{r.public_subdomain}</TableCell>
                  <TableCell className="text-xs">
                    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-[#1F56C5] hover:underline">
                      {url.replace(/^https?:\/\//, "")}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm">{r.event_name}</TableCell>
                  <TableCell className="text-sm">{r.agency_name}</TableCell>
                  <TableCell>{statusPill(r.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        to="/admin/events/$eventId"
                        params={{ eventId: r.event_id }}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(url)}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                        title="Copy public URL"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// -------- Audit ----------------------------------------------------------

function AuditSection() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setTableMissing(false);
    const { data, error } = await supabase.rpc("system_admin_audit_logs", { _limit: 200 });
    if (error) {
      setError(isMissingFn(error) ? MISSING_RPC_HINT : error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as AuditRow[];
    setRows(list);
    setTableMissing(list.length === 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (loading) {
    return (
      <div className="rounded-[16px] border border-[#E6ECF4] bg-white p-8 text-center text-sm text-[#64748B]">
        Loading audit logs…
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        title={tableMissing ? "No audit log entries yet" : "No audit log entries"}
        message="Audit logging may not be enabled, or no admin actions have been recorded yet. This view is read-only."
      />
    );
  }

  return (
    <>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-[#F8FBFF]"
                onClick={() => setSelected(r)}
              >
                <TableCell className="text-xs text-[#64748B]">{fmtDateTime(r.created_at)}</TableCell>
                <TableCell className="text-sm text-[#0F172A]">
                  {r.actor_email ?? r.actor_user_id ?? "—"}
                  {r.actor_role ? (
                    <div className="text-[11px] text-[#64748B]">{formatRoleLabel(r.actor_role)}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm font-medium text-[#0F172A]">{r.action}</TableCell>
                <TableCell className="text-sm text-[#64748B]">{r.agency_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-[#64748B]">{r.event_name ?? "—"}</TableCell>
                <TableCell className="text-xs text-[#64748B]">
                  {r.target_table ? `${r.target_table}` : "—"}
                  {r.target_id ? <div className="truncate">{r.target_id}</div> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AuditDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function AuditDetailDrawer({
  entry,
  onClose,
}: {
  entry: AuditRow | null;
  onClose: () => void;
}) {
  // Defensive redaction of any obvious secret-like keys before display.
  const safeMetadata = useMemo(() => {
    if (!entry) return null;
    const meta = entry.metadata;
    if (!meta || typeof meta !== "object") return meta;
    const SECRET_KEYS = /token|secret|password|api[_-]?key|service[_-]?role/i;
    const redact = (obj: unknown): unknown => {
      if (Array.isArray(obj)) return obj.map(redact);
      if (obj && typeof obj === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v);
        }
        return out;
      }
      return obj;
    };
    return redact(meta);
  }, [entry]);

  return (
    <Sheet open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {entry ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-[#1F56C5]" />
                {entry.action}
              </SheetTitle>
              <SheetDescription>{fmtDateTime(entry.created_at)}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <KV label="Actor" value={entry.actor_email ?? entry.actor_user_id ?? "—"} />
              <KV label="Actor role" value={formatRoleLabel(entry.actor_role)} />
              <KV label="Organisation" value={entry.agency_name ?? "—"} />
              <KV label="Event" value={entry.event_name ?? "—"} />
              <KV label="Target table" value={entry.target_table ?? "—"} />
              <KV label="Target id" value={entry.target_id ?? "—"} />
            </div>

            <Section title="Metadata">
              <pre className="max-h-[40vh] overflow-auto rounded-[8px] bg-[#0F172A] p-3 text-[11px] leading-snug text-[#E2E8F0]">
{JSON.stringify(safeMetadata ?? {}, null, 2)}
              </pre>
              <div className="mt-2 text-[11px] text-[#94A3B8]">
                Secret-like fields (token, secret, password, api_key) are redacted on display.
              </div>
            </Section>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// -------- Billing --------------------------------------------------------

type UpgradeRequestRow = {
  id: string;
  agency_id: string;
  requested_plan_code: string;
  requested_plan_name: string;
  contact_name: string | null;
  contact_email: string | null;
  message: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

type AgencyLookup = {
  agency_id: string;
  name: string;
  slug: string | null;
};

const UPGRADE_STATUSES = [
  "new",
  "reviewing",
  "approved",
  "activated",
  "declined",
  "cancelled",
] as const;

type UpgradeStatus = (typeof UPGRADE_STATUSES)[number];

function upgradeStatusPill(status: string) {
  const map: Record<string, string> = {
    new: "bg-[#EAF2FF] text-[#1F56C5]",
    reviewing: "bg-[#FEF3C7] text-[#92400E]",
    approved: "bg-[#DCFCE7] text-[#166534]",
    activated: "bg-[#DCFCE7] text-[#166534]",
    declined: "bg-[#FEE2E2] text-[#991B1B]",
    cancelled: "bg-[#E2E8F0] text-[#475569]",
  };
  const cls = map[status] ?? "bg-[#F1F5F9] text-[#475569]";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

function BillingSection() {
  const [requests, setRequests] = useState<UpgradeRequestRow[] | null>(null);
  const [agencies, setAgencies] = useState<Record<string, AgencyLookup>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | UpgradeStatus>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrganisationRow | null>(null);
  const [orgLoadingId, setOrgLoadingId] = useState<string | null>(null);
  const orgCacheRef = useRef<OrganisationRow[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: reqErr } = await supabase
      .from("upgrade_requests" as never)
      .select(
        "id, agency_id, requested_plan_code, requested_plan_name, contact_name, contact_email, message, status, created_by, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (reqErr) {
      const code = (reqErr as { code?: string }).code;
      const msg = (reqErr as { message?: string }).message ?? "";
      if (
        code === "42P01" ||
        code === "PGRST205" ||
        code === "PGRST204" ||
        /relation .* does not exist|could not find the table/i.test(msg)
      ) {
        setTableMissing(true);
        setRequests([]);
        setLoading(false);
        return;
      }
      setError(msg || "Failed to load upgrade requests");
      setLoading(false);
      return;
    }
    setTableMissing(false);
    const rows = (data ?? []) as UpgradeRequestRow[];
    setRequests(rows);

    const agencyIds = Array.from(new Set(rows.map((r) => r.agency_id)));
    if (agencyIds.length > 0) {
      const { data: agencyData } = await supabase
        .from("agencies")
        .select("id, name, slug")
        .in("id", agencyIds);
      const lookup: Record<string, AgencyLookup> = {};
      for (const a of (agencyData ?? []) as { id: string; name: string; slug: string | null }[]) {
        lookup[a.id] = { agency_id: a.id, name: a.name, slug: a.slug };
      }
      setAgencies(lookup);
    } else {
      setAgencies({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const needle = q.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      const org = agencies[r.agency_id];
      return (
        (org?.name ?? "").toLowerCase().includes(needle) ||
        (org?.slug ?? "").toLowerCase().includes(needle) ||
        (r.contact_email ?? "").toLowerCase().includes(needle) ||
        (r.requested_plan_name ?? "").toLowerCase().includes(needle) ||
        (r.requested_plan_code ?? "").toLowerCase().includes(needle)
      );
    });
  }, [requests, statusFilter, q, agencies]);

  const updateStatus = async (row: UpgradeRequestRow, next: UpgradeStatus) => {
    setSavingId(row.id);
    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("upgrade_requests" as never)
      .update({ status: next, updated_at: nowIso } as never)
      .eq("id", row.id);
    setSavingId(null);
    if (updErr) {
      toast.error(updErr.message || "Failed to update request");
      return;
    }
    toast.success(`Marked ${next}`);
    setRequests((prev) =>
      prev
        ? prev.map((r) =>
            r.id === row.id ? { ...r, status: next, updated_at: nowIso } : r,
          )
        : prev,
    );
  };

  const openOrganisation = async (agencyId: string) => {
    setOrgLoadingId(agencyId);
    try {
      if (!orgCacheRef.current) {
        const { data, error: orgErr } = await supabase.rpc(
          "system_admin_organisations",
        );
        if (orgErr) {
          toast.error(
            isMissingFn(orgErr) ? MISSING_RPC_HINT : orgErr.message,
          );
          return;
        }
        orgCacheRef.current = (data ?? []) as OrganisationRow[];
      }
      const match = orgCacheRef.current.find((o) => o.agency_id === agencyId);
      if (!match) {
        toast.error("Organisation not found");
        return;
      }
      setSelectedOrg(match);
    } finally {
      setOrgLoadingId(null);
    }
  };

  if (tableMissing) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Upgrade requests table not installed"
          message="Apply supabase/migrations-draft-pricing/02_upgrade_requests.sql in the Supabase SQL editor to enable the upgrade request inbox."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[#FED7AA] bg-[#FFF7ED] p-4 text-sm text-[#9A3412]">
        <div className="font-semibold">Manual plan activations</div>
        <div className="mt-1 text-xs">
          Stripe is not active. Review upgrade requests below, then activate the
          plan manually from the organisation drawer.
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <Input
              placeholder="Search organisation, contact or plan"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | UpgradeStatus)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {UPGRADE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested plan</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={7} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-[#64748B]">
                  No upgrade requests match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const org = agencies[r.agency_id];
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded((id) => (id === r.id ? null : r.id))}
                    >
                      <TableCell className="text-sm font-medium text-[#0F172A]">
                        {r.requested_plan_name}
                        <div className="text-[11px] text-[#64748B]">{r.requested_plan_code}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {org ? (
                          <>
                            <div className="font-medium text-[#0F172A]">{org.name}</div>
                            {org.slug ? (
                              <div className="text-[11px] text-[#64748B]">{org.slug}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[11px] text-[#64748B]">{r.agency_id}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-[#0F172A]">
                        {r.contact_email ?? "—"}
                        {r.contact_name ? (
                          <div className="text-[11px] text-[#64748B]">{r.contact_name}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{upgradeStatusPill(r.status)}</TableCell>
                      <TableCell className="text-sm text-[#64748B]">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-[#64748B]">
                        {r.message ?? "—"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            disabled={orgLoadingId === r.agency_id}
                            onClick={() => openOrganisation(r.agency_id)}
                            className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {orgLoadingId === r.agency_id ? "Opening…" : "Open"}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow key={`${r.id}-detail`} className="bg-[#F8FAFC]">
                        <TableCell colSpan={7} className="p-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <KV label="Requested plan" value={`${r.requested_plan_name} (${r.requested_plan_code})`} />
                                <KV label="Status" value={upgradeStatusPill(r.status)} />
                                <KV label="Contact name" value={r.contact_name ?? "—"} />
                                <KV label="Contact email" value={r.contact_email ?? "—"} />
                                <KV label="Created" value={fmtDateTime(r.created_at)} />
                                <KV label="Updated" value={fmtDateTime(r.updated_at)} />
                              </div>
                              <div>
                                <div className="text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
                                  Organisation ID
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <code className="rounded bg-white px-2 py-1 text-xs text-[#0F172A]">
                                    {r.agency_id}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await copyToClipboard(r.agency_id);
                                      setCopied(r.id);
                                      setTimeout(
                                        () => setCopied((c) => (c === r.id ? null : c)),
                                        1500,
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                                  >
                                    {copied === r.id ? (
                                      <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    {copied === r.id ? "Copied" : "Copy ID"}
                                  </button>
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
                                  Message
                                </div>
                                <div className="mt-1 whitespace-pre-wrap rounded-[10px] border border-[#E6ECF4] bg-white p-3 text-sm text-[#0F172A]">
                                  {r.message?.trim() ? r.message : "No message provided."}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
                                Update status
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(["reviewing", "approved", "activated", "declined"] as UpgradeStatus[]).map(
                                  (s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      disabled={savingId === r.id || r.status === s}
                                      onClick={() => updateStatus(r, s)}
                                      className="inline-flex items-center gap-1 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
                                    >
                                      Mark {s}
                                    </button>
                                  ),
                                )}
                              </div>
                              <div className="rounded-[10px] border border-[#E6ECF4] bg-white p-3 text-xs text-[#64748B]">
                                Activating a plan does not change the subscription
                                automatically. Use the organisation drawer to set
                                the plan and status manually.
                              </div>
                              <button
                                type="button"
                                onClick={() => openOrganisation(r.agency_id)}
                                disabled={orgLoadingId === r.agency_id}
                                className="inline-flex items-center gap-1 rounded-[8px] border border-[#1F56C5] bg-[#1F56C5] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {orgLoadingId === r.agency_id ? "Opening…" : "Open organisation"}
                              </button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <OrganisationDetailDrawer
        org={selectedOrg}
        onClose={() => setSelectedOrg(null)}
      />
    </div>
  );
}

// -------- Reserved / blocked subdomains card ------------------------------

function ReservedSubdomainsCard() {
  const reserved = Array.from(RESERVED_SUBDOMAINS).sort();
  return (
    <Card className="border-[#E6ECF4] p-4">
      <div className="mb-2">
        <div className="text-sm font-semibold text-[#0F172A]">
          Reserved / blocked subdomains ({reserved.length})
        </div>
        <div className="text-xs text-[#64748B]">
          These labels are reserved by GetStampd and can never be claimed by
          an event, regardless of whether any event currently holds them.
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {reserved.map((sub) => (
          <span
            key={sub}
            className="rounded-full bg-[#F1F5F9] px-2.5 py-1 font-mono text-xs font-medium text-[#475569]"
          >
            {sub}
          </span>
        ))}
      </div>
      <div className="mt-3 text-xs text-[#64748B]">
        Source of truth:{" "}
        <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5">
          src/lib/reserved-subdomains.ts
        </code>
        .
      </div>
    </Card>
  );
}

// -------- Subdomain lookup ------------------------------------------------

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "invalid"; label: string; reason: string }
  | { kind: "reserved"; label: string }
  | { kind: "held"; label: string; row: { event_id: string; event_name: string; agency_name: string; status: string; domain_status: string } }
  | { kind: "released"; label: string; row: { event_id: string; event_name: string; agency_name: string; deleted_at: string } }
  | { kind: "available"; label: string }
  | { kind: "error"; message: string };

function SubdomainLookupCard() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });

  async function lookup() {
    const label = q.trim().toLowerCase();
    if (!label) {
      setState({ kind: "idle" });
      return;
    }
    if (!isValidSubdomainLabel(label)) {
      setState({
        kind: "invalid",
        label,
        reason:
          "Labels must be 1–63 chars, lowercase letters/digits/hyphens, and cannot start or end with a hyphen.",
      });
      return;
    }
    if (isReservedSubdomain(label)) {
      setState({ kind: "reserved", label });
      return;
    }
    setState({ kind: "loading" });
    // Check held (active) and released (deleted) in parallel.
    const [{ data: activeRows, error: activeErr }, { data: deletedRows, error: deletedErr }] = await Promise.all([
      supabase.rpc("system_admin_active_events_with_subdomain"),
      supabase.rpc("system_admin_deleted_events_with_subdomain"),
    ]);
    if (activeErr) {
      setState({ kind: "error", message: isMissingFn(activeErr) ? MISSING_RPC_HINT : activeErr.message });
      return;
    }
    if (deletedErr) {
      setState({ kind: "error", message: isMissingFn(deletedErr) ? MISSING_RPC_HINT : deletedErr.message });
      return;
    }
    const held = (activeRows ?? []).find(
      (r: { public_subdomain: string }) => r.public_subdomain?.toLowerCase() === label,
    );
    if (held) {
      setState({ kind: "held", label, row: held });
      return;
    }
    const released = (deletedRows ?? []).find(
      (r: { public_subdomain: string }) => r.public_subdomain?.toLowerCase() === label,
    );
    if (released) {
      setState({ kind: "released", label, row: released });
      return;
    }
    setState({ kind: "available", label });
  }

  return (
    <Card className="border-[#E6ECF4] p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-[#0F172A]">
          Subdomain lookup
        </div>
        <div className="text-xs text-[#64748B]">
          Type any label to see whether it is available, currently held by an
          event, released from a deleted event, reserved by GetStampd, or
          invalid.
        </div>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
      >
        <Input
          placeholder="e.g. cargordtrail"
          value={q}
          onChange={(e) => setQ(e.target.value.toLowerCase())}
          className="h-8 w-64 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" size="sm" variant="outline" disabled={state.kind === "loading"}>
          {state.kind === "loading" ? "Checking…" : "Look up"}
        </Button>
      </form>
      <div className="mt-3">
        <LookupResult state={state} />
      </div>
    </Card>
  );
}

function LookupResult({ state }: { state: LookupState }) {
  if (state.kind === "idle") {
    return <div className="text-xs text-[#64748B]">Enter a subdomain to check its status.</div>;
  }
  if (state.kind === "loading") {
    return <div className="text-xs text-[#64748B]">Checking…</div>;
  }
  if (state.kind === "error") {
    return <div className="text-xs text-destructive">{state.message}</div>;
  }
  const pill = (text: string, cls: string) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>
  );
  return (
    <div className="space-y-1 rounded-md border border-[#E6ECF4] bg-[#F8FAFC] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[#0F172A]">{state.label}</span>
        {state.kind === "available" && pill("Available", "bg-emerald-500/15 text-emerald-700")}
        {state.kind === "held" && pill("Currently held by event", "bg-amber-500/15 text-amber-700")}
        {state.kind === "released" && pill("Released from deleted event", "bg-sky-500/15 text-sky-700")}
        {state.kind === "reserved" && pill("Reserved / blocked", "bg-destructive/15 text-destructive")}
        {state.kind === "invalid" && pill("Invalid format", "bg-destructive/15 text-destructive")}
      </div>
      {state.kind === "reserved" && (
        <div className="text-xs text-[#64748B]">
          Reason: reserved word. This label is blocked globally by GetStampd
          and is never available, even if no event holds it.
        </div>
      )}
      {state.kind === "invalid" && (
        <div className="text-xs text-[#64748B]">Reason: {state.reason}</div>
      )}
      {state.kind === "available" && (
        <div className="text-xs text-[#64748B]">
          No active or archived event owns this label. A new event can claim it.
        </div>
      )}
      {state.kind === "held" && (
        <div className="text-xs text-[#64748B]">
          Held by{" "}
          <span className="font-medium text-[#0F172A]">{state.row.event_name}</span>{" "}
          ({state.row.agency_name}) — event status{" "}
          <span className="font-mono">{state.row.status}</span>, domain{" "}
          <span className="font-mono">{state.row.domain_status}</span>. Archive
          the event to release the label.
        </div>
      )}
      {state.kind === "released" && (
        <div className="text-xs text-[#64748B]">
          Held by deleted event{" "}
          <span className="font-medium text-[#0F172A]">{state.row.event_name}</span>{" "}
          ({state.row.agency_name}). Use “Released / old subdomains” below to
          clear it.
        </div>
      )}
    </div>
  );
}

// -------- System settings ------------------------------------------------

function SettingsSection() {
  const reserved = Array.from(RESERVED_SUBDOMAINS).sort();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Platform domains
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-[#64748B]">Public domain</dt><dd className="font-medium text-[#0F172A]">getstampd.com.au</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Admin domain</dt><dd className="font-medium text-[#0F172A]">app.getstampd.com.au</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Tenant pattern</dt><dd className="font-medium text-[#0F172A]">&lt;org&gt;.getstampd.com.au</dd></div>
        </dl>
      </Card>

      <Card>
        <div className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Environment
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-[#64748B]">Test banner</dt><dd className="font-medium text-[#0F172A]">Visible on admin surfaces</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Payments</dt><dd className="font-medium text-[#0F172A]">Not active</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">MapKit worker</dt><dd className="font-medium text-[#0F172A]">/debug/worker-health</dd></div>
        </dl>
      </Card>

      <Card className="lg:col-span-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Reserved subdomains ({reserved.length})
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reserved.map((sub) => (
            <span
              key={sub}
              className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#475569]"
            >
              {sub}
            </span>
          ))}
        </div>
        <div className="mt-3 text-xs text-[#64748B]">
          These cannot be claimed by organisations. Defined in
          <code className="mx-1 rounded bg-[#F1F5F9] px-1.5 py-0.5">src/lib/reserved-subdomains.ts</code>.
        </div>
      </Card>
    </div>
  );
}

// -------- Small presentation helpers --------------------------------------

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-[#0F172A]">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        {title}
      </div>
      {children}
    </div>
  );
}

// -------- Support tickets -------------------------------------------------

type SupportTicketCounts = {
  open_count: number;
  urgent_open_count: number;
};

function SupportTicketsAlert({ onOpen }: { onOpen: () => void }) {
  const [counts, setCounts] = useState<SupportTicketCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc(
        "system_admin_support_ticket_counts",
      );
      if (cancelled) return;
      if (error || !data) {
        setCounts(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setCounts({
        open_count: Number(row?.open_count ?? 0),
        urgent_open_count: Number(row?.urgent_open_count ?? 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!counts || counts.open_count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-left text-sm text-[#9A3412] hover:bg-[#FFEDD5]"
    >
      <span className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4" />
        <span className="font-semibold">
          {counts.open_count} open support ticket{counts.open_count === 1 ? "" : "s"} requiring attention
          {counts.urgent_open_count > 0
            ? ` (${counts.urgent_open_count} urgent)`
            : ""}
        </span>
      </span>
      <span className="text-xs font-medium uppercase tracking-wide">
        View tickets →
      </span>
    </button>
  );
}

type SupportTicketRow = {
  id: string;
  organisation_id: string | null;
  organisation_name: string | null;
  submitted_by: string;
  submitted_by_email: string | null;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  page_url: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

const TICKET_STATUSES = [
  "new",
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
] as const;

const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function SupportTicketsSection() {
  const [rows, setRows] = useState<SupportTicketRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<SupportTicketRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc(
      "system_admin_support_tickets",
      {
        p_status: statusFilter === "all" ? null : statusFilter,
        p_limit: 200,
      },
    );
    setLoading(false);
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    const sorted = ((data ?? []) as SupportTicketRow[]).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setRows(sorted);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A]">Support tickets</h2>
          <p className="text-xs text-[#64748B]">
            All tickets across all organisations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={load}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-white px-3 text-sm hover:bg-[#F8FAFC]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-[12px] border border-[#E6ECF4] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Submitted by</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (rows === null || rows.length === 0) ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-[#64748B]">
                  Loading tickets…
                </TableCell>
              </TableRow>
            ) : rows && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-[#64748B]">
                  No tickets match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketStatusBadge value={t.status} /></TableCell>
                  <TableCell><TicketPriorityBadge value={t.priority} /></TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">
                    {t.subject}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {t.organisation_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-[#475569]">
                    {t.submitted_by_email ?? t.submitted_by.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs">{t.category.replace(/_/g, " ")}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-[#64748B]">
                    {new Date(t.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-[#64748B]">
                    {new Date(t.updated_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-[#F8FAFC]"
                    >
                      View
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupportTicketSheet
        ticket={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
      />
    </div>
  );
}

function TicketStatusBadge({ value }: { value: string }) {
  const tone: Record<string, string> = {
    new: "bg-[#EAF2FF] text-[#1F56C5]",
    open: "bg-[#EAF2FF] text-[#1F56C5]",
    in_progress: "bg-[#FFF7ED] text-[#9A3412]",
    waiting_on_user: "bg-[#FEF3C7] text-[#92400E]",
    resolved: "bg-[#DCFCE7] text-[#166534]",
    closed: "bg-[#F1F5F9] text-[#475569]",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[value] ?? "bg-[#F1F5F9] text-[#475569]"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function TicketPriorityBadge({ value }: { value: string }) {
  const tone: Record<string, string> = {
    low: "bg-[#F1F5F9] text-[#475569]",
    normal: "bg-[#EAF2FF] text-[#1F56C5]",
    high: "bg-[#FFF7ED] text-[#9A3412]",
    urgent: "bg-[#FEE2E2] text-[#991B1B]",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[value] ?? "bg-[#F1F5F9] text-[#475569]"}`}>
      {value}
    </span>
  );
}

function SupportTicketSheet({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: SupportTicketRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<string>("new");
  const [priority, setPriority] = useState<string>("normal");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ticket) return;
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setNotes(ticket.admin_notes ?? "");
  }, [ticket]);

  const save = async () => {
    if (!ticket) return;
    setSaving(true);
    const { error } = await supabase.rpc("system_admin_update_support_ticket", {
      p_id: ticket.id,
      p_status: status,
      p_priority: priority,
      p_admin_notes: notes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ticket updated");
    onSaved();
  };

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
        {ticket && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-base">{ticket.subject}</SheetTitle>
              <SheetDescription>
                {ticket.organisation_name ?? "No organisation"} ·{" "}
                {ticket.submitted_by_email ?? ticket.submitted_by.slice(0, 8)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-md border bg-[#F8FAFC] p-3 text-xs text-[#475569]">
                <div><span className="font-medium text-[#0F172A]">Category:</span> {ticket.category.replace(/_/g, " ")}</div>
                <div><span className="font-medium text-[#0F172A]">Created:</span> {new Date(ticket.created_at).toLocaleString()}</div>
                <div><span className="font-medium text-[#0F172A]">Updated:</span> {new Date(ticket.updated_at).toLocaleString()}</div>
                {ticket.page_url && (
                  <div className="break-all">
                    <span className="font-medium text-[#0F172A]">Page:</span> {ticket.page_url}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  Description
                </div>
                <div className="whitespace-pre-wrap rounded-md border bg-white p-3 text-sm text-[#0F172A]">
                  {ticket.description}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#0F172A]">Status</label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#0F172A]">Priority</label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#0F172A]">Admin notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                  placeholder="Internal notes only — not visible to the submitter."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium hover:bg-[#F8FAFC]"
                  disabled={saving}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#2F6FE4] px-4 text-sm font-semibold text-white hover:bg-[#1F56C5] disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
