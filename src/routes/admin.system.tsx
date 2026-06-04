import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  Calendar,
  ScrollText,
  CreditCard,
  Settings2,
  LayoutDashboard,
  Search,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { NoAccessScreen } from "@/components/no-access-screen";
import { useAuth } from "@/hooks/use-auth";
import { formatRoleLabel } from "@/lib/role-labels";
import { RESERVED_SUBDOMAINS } from "@/lib/reserved-subdomains";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
};

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

type EventRow = {
  event_id: string;
  agency_id: string;
  agency_name: string;
  agency_slug: string | null;
  event_name: string;
  event_slug: string | null;
  public_slug: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  venue_count: number;
  passport_count: number;
  checkin_count: number;
  last_checkin_at: string | null;
  activation_status: string | null;
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
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#0F172A]">
        {typeof value === "number" ? fmtNum(value) : value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[#64748B]">{hint}</div>
      ) : null}
    </Card>
  );
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

// -------- Main component --------------------------------------------------

function SystemAdmin() {
  const access = useAdminAccess();
  const { email } = useAuth();
  const [tab, setTab] = useState<string>("overview");

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
          <TabsContent value="overview"><OverviewSection /></TabsContent>
          <TabsContent value="orgs"><OrganisationsSection /></TabsContent>
          <TabsContent value="users"><UsersSection /></TabsContent>
          <TabsContent value="events"><EventsSection /></TabsContent>
          <TabsContent value="audit"><AuditSection /></TabsContent>
          <TabsContent value="billing"><BillingSection /></TabsContent>
          <TabsContent value="settings"><SettingsSection /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// -------- Overview --------------------------------------------------------

function OverviewSection() {
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
      />
      <StatCard
        label="Events"
        value={data.total_events}
        hint={`${fmtNum(data.published_events)} published · ${fmtNum(data.draft_events)} draft`}
      />
      <StatCard label="Venues" value={data.total_venues} />
      <StatCard label="Visitor passports" value={data.total_passports} />
      <StatCard
        label="Check-ins (all time)"
        value={data.total_checkins}
      />
      <StatCard
        label="Check-ins (24h)"
        value={data.checkins_24h}
      />
      <StatCard
        label="Check-ins (7d)"
        value={data.checkins_7d}
      />
      <StatCard
        label="Published events"
        value={data.published_events}
        hint={`${fmtNum(data.draft_events)} drafts`}
      />
    </div>
  );
}

// -------- Organisations ---------------------------------------------------

function OrganisationsSection() {
  const [rows, setRows] = useState<OrganisationRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

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
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.slug ?? "").toLowerCase().includes(needle) ||
        (r.owner_email ?? "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
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
        <div className="text-xs text-[#64748B]">
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
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={10} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-[#64748B]">
                  No organisations match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.agency_id}>
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
                  <TableCell>{statusPill(r.status)}</TableCell>
                  <TableCell className="text-sm text-[#64748B]">{fmtDate(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {r.slug ? (
                      <button
                        type="button"
                        onClick={async () => {
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
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
              <TableHead>Role</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined / invited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={5} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-[#64748B]">
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
                return (
                  <TableRow key={`${r.user_id ?? r.invited_email ?? "row"}-${r.role}-${idx}`}>
                    <TableCell className="text-sm text-[#0F172A]">
                      {r.email ?? r.invited_email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-[#EAF2FF] px-2 py-0.5 text-[11px] font-medium text-[#1F56C5]">
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// -------- Events ----------------------------------------------------------

function EventsSection() {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [agencyId, setAgencyId] = useState<string>("all");

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
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (agencyId !== "all" && r.agency_id !== agencyId) return false;
      if (!needle) return true;
      return (
        r.event_name.toLowerCase().includes(needle) ||
        r.agency_name.toLowerCase().includes(needle) ||
        (r.public_slug ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status, agencyId]);

  const publicUrlFor = (r: EventRow) => {
    if (!r.public_slug || !r.agency_slug) return null;
    return `https://www.getstampd.com.au/t/${r.agency_slug}/e/${r.public_slug}`;
  };

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
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
        <Select value={status} onValueChange={setStatus}>
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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow cols={9} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-[#64748B]">
                  No events match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const publicUrl = publicUrlFor(r);
                return (
                  <TableRow key={r.event_id}>
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
                    <TableCell className="max-w-[220px] truncate text-xs text-[#64748B]">
                      {publicUrl ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(r.venue_count)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(r.passport_count)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(r.checkin_count)}</TableCell>
                    <TableCell className="text-sm text-[#64748B]">
                      {fmtDateTime(r.last_checkin_at)}
                    </TableCell>
                    <TableCell className="text-right">
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// -------- Audit ----------------------------------------------------------

function AuditSection() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

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
            <TableRow key={r.id}>
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
  );
}

// -------- Billing --------------------------------------------------------

function BillingSection() {
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[#FED7AA] bg-[#FFF7ED] p-4 text-sm text-[#9A3412]">
        <div className="font-semibold">Payments are not active</div>
        <div className="mt-1 text-xs">
          The platform is in test mode. Stripe activations are not collecting
          live charges. Once billing is enabled, organisations and event
          activations will appear here.
        </div>
      </div>
      <EmptyState
        title="Billing dashboard coming soon"
        message="Per-organisation plans, invoices and event activations will be wired in once Stripe is live. The Events tab already surfaces any event_activations.status that exists."
      />
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
