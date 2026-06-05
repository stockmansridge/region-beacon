import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/placeholder";
import { AdminEventAnnouncements } from "@/components/admin-event-announcements";
import { AdminEventRewards } from "@/components/admin-event-rewards";
import { AdminEventPoster } from "@/components/admin-event-poster";
import { QrPreview } from "@/components/qr-preview";
import {
  deleteVenueAssetSafely,
  getVenueAssetPublicUrl,
  uploadVenueAsset,
  VENUE_ASSET_ALLOWED_MIME,
  VENUE_ASSET_MAX_BYTES,
  type VenueAssetKind,
} from "@/lib/venue-assets";
import { buildAppleMapsDirectionsUrl } from "@/lib/venue-directions";
import { VenueMapKitPicker } from "@/components/venue-mapkit-picker";
import { EventTermsDialog } from "@/components/event-terms-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { posterFilename } from "@/lib/qr-poster";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { useAuth } from "@/hooks/use-auth";
import { PUBLIC_TENANT_ROOT_DOMAIN, tenantHost, tenantUrl } from "@/lib/domains";
import { useDiagnosticsEnabled, formatDiagnosticReport } from "@/lib/diagnostics";
import { DiagnosticCopyButton } from "@/components/diagnostic-panel";
import { resolveEventPalette } from "@/lib/event-palettes";
import { getBackground } from "@/lib/event-backgrounds";
import {
  getPlanByCode,
  getNextPlanAfter,
} from "@/lib/getstampd-pricing";

type LoadDiagnostic = {
  step: string;
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

export const Route = createFileRoute("/admin/events/$eventId")({
  head: () => ({ meta: [{ title: "Event detail" }] }),
  component: EventDetail,
  codeSplitGroupings: [],
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  status: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  current_terms_version_id: string | null;
  deleted_at: string | null;
};

type Branding = {
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
  palette_key: string | null;
  page_background_key: string | null;
  page_background_color: string | null;
  card_background_color: string | null;
};

type Domain = {
  id: string;
  public_subdomain: string | null;
  custom_domain: string | null;
  domain_type: string;
  status: string;
  is_primary: boolean;
  verified_at: string | null;
};

type TermsVersion = {
  id: string;
  legal_source: "external_url" | "local_text" | null;
  terms_version: string;
  terms_url: string | null;
  terms_title: string | null;
  terms_body: string | null;
  privacy_version: string;
  privacy_url: string | null;
  privacy_title: string | null;
  privacy_body: string | null;
  effective_at: string;
};

type CheckinSettings = {
  one_checkin_per_venue: boolean;
  minimum_seconds_between_checkins: number;
  allow_manual_admin_checkins: boolean;
  max_checkins_per_passport_per_day: number | null;
};

type LeaderboardSettings = {
  is_enabled: boolean;
  display_mode: string;
  show_first_name: boolean;
  show_last_initial: boolean;
  show_visit_count: boolean;
  hide_below_checkins: number;
  allow_visitor_opt_out: boolean;
};

type Venue = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  order_index: number;
  description: string | null;
  website_url: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  deleted_at: string | null;
};

type VenueFilter = "active" | "disabled" | "all";

type QrSummary = {
  venue_id: string;
  status: string;
  issued_at: string;
  // Optional: the `entry_value` column is added by the prize-draw migration
  // (supabase/migrations-draft-rewards-prize-draw). In environments where
  // that migration has not yet been applied, the loader degrades to null.
  entry_value: number | null;
  token: string | null;
};

type Activation = {
  status: string;
  activation_kind: string;
  activated_at: string | null;
  expires_at: string | null;
};

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  domains: Domain[];
  terms: TermsVersion | null;
  checkin: CheckinSettings | null;
  leaderboard: LeaderboardSettings | null;
  venues: Venue[];
  qrByVenue: Map<string, QrSummary>;
  offerSummaryByVenue: Map<string, string | null>;
  offerSupported: boolean;
  activation: Activation | null;
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch (_e) {
    return "—";
  }
}

type EditForm = {
  name: string;
  description: string;
  timezone: string;
  starts_at: string; // datetime-local
  ends_at: string;   // datetime-local
};


type CheckinEditForm = {
  one_checkin_per_venue: boolean;
  minimum_seconds_between_checkins: string;
  allow_manual_admin_checkins: boolean;
  max_checkins_per_passport_per_day: string;
};

const LEADERBOARD_DISPLAY_MODES = [
  "first_name_last_initial",
  "first_name_only",
  "alias_only",
  "anonymous",
] as const;
type LeaderboardDisplayMode = (typeof LEADERBOARD_DISPLAY_MODES)[number];

type LeaderboardEditForm = {
  is_enabled: boolean;
  display_mode: LeaderboardDisplayMode;
  show_first_name: boolean;
  show_last_initial: boolean;
  show_visit_count: boolean;
  hide_below_checkins: string;
  allow_visitor_opt_out: boolean;
};

type VenueEditForm = {
  name: string;
  address: string;
  lat: string;
  lng: string;
  order_index: string;
  status: "active" | "inactive";
  description: string;
  offer_summary: string;
  website_url: string;
  phone: string;
  logo_path: string | null;
  cover_path: string | null;
};

type VenueSaveDebug = {
  route: string;
  action: "insert" | "update" | "validation" | "preflight" | "exception";
  payloadKeys: string[];
  venueId: string | "new" | null;
  eventId: string;
  agencyId: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
  httpStatus?: number | null;
  httpStatusText?: string | null;
  matchedRows?: number | null;
};

function formatVenueSaveFailure(debug: VenueSaveDebug) {
  const parts = [debug.message];
  if (debug.details) parts.push(`Details: ${debug.details}`);
  if (debug.hint) parts.push(`Hint: ${debug.hint}`);
  if (debug.code) parts.push(`Code: ${debug.code}`);
  if (debug.httpStatus) parts.push(`HTTP ${debug.httpStatus}${debug.httpStatusText ? ` ${debug.httpStatusText}` : ""}`);
  if (debug.matchedRows === 0) parts.push("Matched rows: 0");
  return parts.join("\n");
}

function venueSaveDebugFromError(args: {
  action: VenueSaveDebug["action"];
  payloadKeys: string[];
  venueId: string | "new" | null;
  eventId: string;
  agencyId: string | null;
  error: unknown;
  httpStatus?: number | null;
  httpStatusText?: string | null;
  matchedRows?: number | null;
}): VenueSaveDebug {
  const err = args.error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
    status?: unknown;
    statusText?: unknown;
  } | null;
  return {
    route: "client saveVenue in src/routes/admin.events.$eventId.tsx",
    action: args.action,
    payloadKeys: args.payloadKeys,
    venueId: args.venueId,
    eventId: args.eventId,
    agencyId: args.agencyId,
    message:
      typeof err?.message === "string" && err.message.trim()
        ? err.message
        : typeof args.error === "string" && args.error.trim()
          ? args.error
          : "Venue save failed without an error message from the request layer.",
    details: typeof err?.details === "string" ? err.details : null,
    hint: typeof err?.hint === "string" ? err.hint : null,
    code: typeof err?.code === "string" ? err.code : null,
    httpStatus:
      typeof args.httpStatus === "number"
        ? args.httpStatus
        : typeof err?.status === "number"
          ? err.status
          : null,
    httpStatusText:
      typeof args.httpStatusText === "string"
        ? args.httpStatusText
        : typeof err?.statusText === "string"
          ? err.statusText
          : null,
    matchedRows: args.matchedRows ?? null,
  };
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type EventTabKey =
  | "overview"
  | "details"
  | "branding"
  | "venues"
  | "checkin"
  | "leaderboard"
  | "terms"
  | "analytics";

const EVENT_TABS: Array<{ key: EventTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "details", label: "Details" },
  { key: "branding", label: "Branding" },
  { key: "venues", label: "Venues" },
  { key: "checkin", label: "Check-in" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "terms", label: "Terms & privacy" },
  { key: "analytics", label: "Analytics" },
];

function readTabFromHash(): EventTabKey {
  if (typeof window === "undefined") return "overview";
  const m = window.location.hash.match(/tab=([a-z]+)/i);
  const key = m?.[1] as EventTabKey | undefined;
  return EVENT_TABS.some((t) => t.key === key) ? (key as EventTabKey) : "overview";
}

const EventTabContext = createContext<EventTabKey>("overview");

function EventTabBar({
  active,
  onChange,
}: {
  active: EventTabKey;
  onChange: (next: EventTabKey) => void;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        role="tablist"
        className="inline-flex min-w-max items-center gap-1.5 rounded-[14px] bg-[#EEF2F7] p-1"
      >
        {EVENT_TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className={
                "flex h-10 shrink-0 items-center whitespace-nowrap rounded-[10px] px-4 text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-white text-[#1F56C5] shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
                  : "text-[#64748B] hover:bg-white/70 hover:text-[#111827]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}


function EventDetail() {
  const { eventId } = Route.useParams();
  const agency = useAgencyContext();
  const auth = useAuth();
  const agencyId = agency.selected?.id ?? null;
  const canEdit =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [diagnosticsEnabled] = useDiagnosticsEnabled();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [diagnostic, setDiagnostic] = useState<LoadDiagnostic | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTabRaw] = useState<EventTabKey>(() => readTabFromHash());
  const setActiveTab = (next: EventTabKey) => {
    setActiveTabRaw(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = `tab=${next}`;
      window.history.replaceState(null, "", url.toString());
    }
  };
  useEffect(() => {
    const onHash = () => setActiveTabRaw(readTabFromHash());
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", onHash);
      return () => window.removeEventListener("hashchange", onHash);
    }
  }, []);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [basicsSaveSuccess, setBasicsSaveSuccess] = useState(false);

  const [isEditingCheckin, setIsEditingCheckin] = useState(false);
  const [checkinForm, setCheckinForm] = useState<CheckinEditForm | null>(null);
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinSaveError, setCheckinSaveError] = useState<string | null>(null);
  const [checkinValidationError, setCheckinValidationError] = useState<string | null>(null);
  const [checkinSaveSuccess, setCheckinSaveSuccess] = useState(false);

  const [isEditingLeaderboard, setIsEditingLeaderboard] = useState(false);
  const [lbForm, setLbForm] = useState<LeaderboardEditForm | null>(null);
  const [lbSaving, setLbSaving] = useState(false);
  const [lbSaveError, setLbSaveError] = useState<string | null>(null);
  const [lbValidationError, setLbValidationError] = useState<string | null>(null);
  const [lbSaveSuccess, setLbSaveSuccess] = useState(false);

  // Venue editor: "new" = creating, string = editing existing id, null = closed.
  const [venueEditingId, setVenueEditingId] = useState<string | "new" | null>(null);
  const [venueForm, setVenueForm] = useState<VenueEditForm | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueSaveError, setVenueSaveError] = useState<string | null>(null);
  const [venueSaveDebug, setVenueSaveDebug] = useState<VenueSaveDebug | null>(null);
  const [venueValidationError, setVenueValidationError] = useState<string | null>(null);
  const [venueArchivingId, setVenueArchivingId] = useState<string | null>(null);
  const [venueArchiveError, setVenueArchiveError] = useState<string | null>(null);
  const [forceDeleteVenueId, setForceDeleteVenueId] = useState<string | null>(null);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState("");
  const [forceDeleteBusy, setForceDeleteBusy] = useState(false);
  const [forceDeleteError, setForceDeleteError] = useState<string | null>(null);
  const [venueFilter, setVenueFilter] = useState<VenueFilter>("active");
  const [venueAssetBusy, setVenueAssetBusy] = useState<VenueAssetKind | null>(null);
  const [venueAssetError, setVenueAssetError] = useState<string | null>(null);
  const venueEditorRef = useRef<HTMLDivElement | null>(null);

  // QR controls — token is fetched only on explicit reveal/rotate and held in
  // memory only. Map: venue_id -> revealed token.
  const [revealedQrByVenue, setRevealedQrByVenue] = useState<Map<string, string>>(new Map());
  const [qrActionVenueId, setQrActionVenueId] = useState<string | null>(null);
  const [qrActionError, setQrActionError] = useState<string | null>(null);
  const [qrSupportDetails, setQrSupportDetails] = useState<string | null>(null);
  const [qrSupportCopied, setQrSupportCopied] = useState(false);
  const [qrCopiedVenueId, setQrCopiedVenueId] = useState<string | null>(null);
  const [qrEntryDraft, setQrEntryDraft] = useState<Map<string, string>>(new Map());
  const [qrEntrySavingId, setQrEntrySavingId] = useState<string | null>(null);

  useEffect(() => {
    if (eventId === "new") {
      setDiagnostic({
        step: "params",
        message:
          'The route was opened with the literal id "new". The create-event flow should navigate to a real event id after insert.',
        code: "INVALID_ID",
      });
      setState("not-found");
      return;
    }
    // Wait for the agency context to finish resolving before deciding
    // whether to show an error. Without this gate, the first render
    // (where agencyId is briefly null while agency context loads) flashes
    // the "Could not load event detail" panel before the real fetch runs.
    if (agency.status === "loading") {
      setState("loading");
      setDiagnostic(null);
      return;
    }
    if (!agencyId) {
      setDiagnostic({
        step: "agency-context",
        message:
          "No organisation is selected for the current session. Switch to an organisation in the workspace switcher before opening this event.",
        code: "NO_AGENCY",
      });
      setState("error");
      return;
    }

    let cancelled = false;
    setState("loading");
    setDiagnostic(null);

    (async () => {
      const userId = auth.session?.user.id ?? null;
      try {
        // 1. Fetch event with explicit agency_id filter — confirms ownership.
        const { data: event, error: evErr } = await supabase
          .from("events")
          .select(
            "id, agency_id, name, slug, public_slug, status, timezone, starts_at, ends_at, description, created_at, updated_at, current_terms_version_id, deleted_at",
          )
          .eq("id", eventId)
          .eq("agency_id", agencyId)
          .maybeSingle();

        if (cancelled) return;
        if (evErr) {
          console.error("[event-detail] events lookup failed", {
            eventId,
            agencyId,
            userId,
            error: evErr,
          });
          setDiagnostic({
            step: "events",
            message: evErr.message,
            code: (evErr as any).code ?? null,
            details: (evErr as any).details ?? null,
            hint: (evErr as any).hint ?? null,
          });
          setState("error");
          return;
        }
        if (!event) {
          // Probe whether the row exists at all (ignoring agency_id) to tell
          // "wrong agency" vs "no such event" vs "RLS hidden" apart.
          let probeNote =
            "Either the event id is wrong, the event belongs to another agency, or RLS hid it.";
          try {
            const { data: probe, error: probeErr } = await supabase
              .from("events")
              .select("id, agency_id, deleted_at")
              .eq("id", eventId)
              .maybeSingle();
            if (probeErr) {
              probeNote = `Probe without agency filter failed: ${probeErr.message}. This usually means RLS denies SELECT on the events table for this user.`;
            } else if (!probe) {
              probeNote =
                "No event row exists with this id (any agency). The id is wrong or the row was hard-deleted.";
            } else if (probe.deleted_at) {
              probeNote = `Event exists but is soft-deleted (deleted_at = ${probe.deleted_at}).`;
            } else if (probe.agency_id !== agencyId) {
              probeNote = `Event exists but belongs to agency ${probe.agency_id}, not the currently selected agency ${agencyId}.`;
            }
          } catch (probeException) {
            probeNote = `Probe threw: ${String((probeException as any)?.message ?? probeException)}`;
          }
          console.warn("[event-detail] events lookup returned no rows", {
            eventId,
            agencyId,
            userId,
            probeNote,
          });
          setDiagnostic({
            step: "events",
            message: `No event row returned for this id and agency. ${probeNote}`,
            code: "NO_ROWS",
          });
          setState("not-found");
          return;
        }

        // 2. Fetch related rows in parallel.
        const [brandingRes, domainsRes, checkinRes, leaderboardRes, venuesRes, termsRes, activationRes] =
          await Promise.all([
            supabase
              .from("event_branding")
              .select("*")
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .maybeSingle(),
            supabase
              .from("event_domains")
              .select("id, public_subdomain, custom_domain, domain_type, status, is_primary, verified_at")
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .order("is_primary", { ascending: false }),
            supabase
              .from("event_checkin_settings")
              .select(
                "one_checkin_per_venue, minimum_seconds_between_checkins, allow_manual_admin_checkins, max_checkins_per_passport_per_day",
              )
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .maybeSingle(),
            supabase
              .from("leaderboard_settings")
              .select("is_enabled, display_mode, show_first_name, show_last_initial, show_visit_count, hide_below_checkins, allow_visitor_opt_out")
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .maybeSingle(),
            supabase
              .from("venues")
              .select(
                "id, name, address, lat, lng, status, order_index, description, website_url, phone, logo_path, cover_path, deleted_at",
              )
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .order("order_index", { ascending: true }),
            event.current_terms_version_id
              ? supabase
                  .from("event_terms_versions")
                  .select("id, legal_source, terms_version, terms_url, terms_title, terms_body, privacy_version, privacy_url, privacy_title, privacy_body, effective_at")
                  .eq("id", event.current_terms_version_id)
                  .eq("event_id", event.id)
                  .eq("agency_id", agencyId)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            supabase
              .from("event_activations")
              .select("status, activation_kind, activated_at, expires_at")
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .maybeSingle(),
          ]);

        if (cancelled) return;
        const stepErrors: Array<[string, any]> = [
          ["event_branding", brandingRes.error],
          ["event_domains", domainsRes.error],
          ["event_checkin_settings", checkinRes.error],
          ["leaderboard_settings", leaderboardRes.error],
          ["venues", venuesRes.error],
          ["event_terms_versions", termsRes.error],
        ];
        const firstError = stepErrors.find(([, e]) => e);
        if (firstError) {
          const [step, err] = firstError;
          console.error("[event-detail] related-row lookup failed", {
            step,
            eventId,
            agencyId,
            userId,
            error: err,
          });
          setDiagnostic({
            step,
            message: err?.message ?? "Unknown error",
            code: err?.code ?? null,
            details: err?.details ?? null,
            hint: err?.hint ?? null,
          });
          setState("error");
          return;
        }

        const venues = (venuesRes.data ?? []) as Venue[];

        // 3. Active QR codes for venues.
        const qrByVenue = new Map<string, QrSummary>();
        if (venues.length > 0) {
          // The `entry_value` column comes from the prize-draw migration
          // (`migrations-draft-rewards-prize-draw`). It is NOT yet applied
          // to every environment, so we attempt the full select first and
          // fall back to a select without `entry_value` if Postgres reports
          // "undefined column" (SQLSTATE 42703). This keeps event detail
          // loadable in environments where the migration is still pending.
          const baseCols = "venue_id, status, issued_at, token";
          let qrRows: any[] | null = null;
          let qrErr: any = null;
          {
            const res = await supabase
              .from("venue_qr_codes")
              .select(`${baseCols}, entry_value`)
              .eq("agency_id", agencyId)
              .eq("event_id", event.id)
              .eq("status", "active")
              .in("venue_id", venues.map((v) => v.id));
            qrRows = res.data as any[] | null;
            qrErr = res.error;
          }
          if (qrErr && ((qrErr as any).code === "42703" || /entry_value/.test(qrErr.message ?? ""))) {
            console.warn("[event-detail] venue_qr_codes.entry_value missing — falling back", {
              eventId,
              agencyId,
            });
            const res = await supabase
              .from("venue_qr_codes")
              .select(baseCols)
              .eq("agency_id", agencyId)
              .eq("event_id", event.id)
              .eq("status", "active")
              .in("venue_id", venues.map((v) => v.id));
            qrRows = res.data as any[] | null;
            qrErr = res.error;
          }

          if (cancelled) return;
          if (qrErr) {
            console.error("[event-detail] venue_qr_codes lookup failed", {
              eventId,
              agencyId,
              userId,
              error: qrErr,
            });
            setDiagnostic({
              step: "venue_qr_codes",
              message: qrErr.message,
              code: (qrErr as any).code ?? null,
              details: (qrErr as any).details ?? null,
              hint: (qrErr as any).hint ?? null,
            });
            setState("error");
            return;
          }
          for (const row of (qrRows ?? []) as Array<Partial<QrSummary> & { venue_id: string; status: string; issued_at: string }>) {
            if (!qrByVenue.has(row.venue_id)) {
              qrByVenue.set(row.venue_id, {
                venue_id: row.venue_id,
                status: row.status,
                issued_at: row.issued_at,
                entry_value: (row as any).entry_value ?? null,
                token: (row as any).token ?? null,
              });
            }
          }
        }

        // Optional venues.offer_summary column — degrade silently if missing.
        const offerSummaryByVenue = new Map<string, string | null>();
        let offerSupported = false;
        if (venues.length > 0) {
          try {
            const { data: offerRows, error: offerErr } = await supabase
              .from("venues")
              .select("id, offer_summary" as any)
              .eq("agency_id", agencyId)
              .eq("event_id", event.id)
              .in("id", venues.map((v) => v.id));
            if (!offerErr && Array.isArray(offerRows)) {
              offerSupported = true;
              for (const row of offerRows as unknown as Array<{ id: string; offer_summary: string | null }>) {
                offerSummaryByVenue.set(row.id, row.offer_summary ?? null);
              }
            }
          } catch {
            // column not deployed in this env
          }
        }
        if (cancelled) return;

        setBundle({
          event: event as EventRow,
          branding: (brandingRes.data ?? null) as Branding | null,
          domains: (domainsRes.data ?? []) as Domain[],
          terms: (termsRes.data ?? null) as TermsVersion | null,
          checkin: (checkinRes.data ?? null) as CheckinSettings | null,
          leaderboard: (leaderboardRes.data ?? null) as LeaderboardSettings | null,
          venues,
          qrByVenue,
          offerSummaryByVenue,
          offerSupported,
          activation: activationRes.error ? null : ((activationRes.data ?? null) as Activation | null),
        });
        setState("ready");
      } catch (unknownErr) {
        if (cancelled) return;
        console.error("[event-detail] unhandled loader exception", {
          eventId,
          agencyId,
          userId,
          error: unknownErr,
        });
        const anyErr = unknownErr as any;
        setDiagnostic({
          step: "unknown",
          message: String(anyErr?.message ?? anyErr ?? "Unknown event detail loader error"),
          code: anyErr?.code ?? null,
          details:
            anyErr?.details ??
            (anyErr?.stack ? String(anyErr.stack).split("\n").slice(0, 4).join("\n") : null),
          hint: anyErr?.hint ?? null,
        });
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId, eventId, reloadKey, auth.session?.user.id, agency.status]);

  // Inline-editable tabs: hydrate form state from the loaded bundle so users
  // can edit directly inside each tab without clicking an "Edit" toggle.
  // Only hydrates when the corresponding form is null, so in-flight edits
  // survive background bundle refreshes after a save.
  useEffect(() => {
    if (!bundle || !canEdit) return;
    if (!form) {
      const e = bundle.event;
      setForm({
        name: e.name ?? "",
        description: e.description ?? "",
        timezone: e.timezone ?? "",
        starts_at: toLocalInput(e.starts_at),
        ends_at: toLocalInput(e.ends_at),
      });
      setIsEditing(true);
    }
    if (!checkinForm) {
      setCheckinForm({
        one_checkin_per_venue: bundle.checkin?.one_checkin_per_venue ?? true,
        minimum_seconds_between_checkins: String(
          bundle.checkin?.minimum_seconds_between_checkins ?? 0,
        ),
        allow_manual_admin_checkins: bundle.checkin?.allow_manual_admin_checkins ?? false,
        max_checkins_per_passport_per_day:
          bundle.checkin?.max_checkins_per_passport_per_day === null ||
          bundle.checkin?.max_checkins_per_passport_per_day === undefined
            ? ""
            : String(bundle.checkin.max_checkins_per_passport_per_day),
      });
      setIsEditingCheckin(true);
    }
    if (!lbForm) {
      const lb = bundle.leaderboard;
      const mode = (lb?.display_mode ?? "first_name_last_initial") as LeaderboardDisplayMode;
      setLbForm({
        is_enabled: lb?.is_enabled ?? false,
        display_mode: (LEADERBOARD_DISPLAY_MODES as readonly string[]).includes(mode)
          ? mode
          : "first_name_last_initial",
        show_first_name: lb?.show_first_name ?? true,
        show_last_initial: lb?.show_last_initial ?? true,
        show_visit_count: lb?.show_visit_count ?? false,
        hide_below_checkins: String(lb?.hide_below_checkins ?? 0),
        allow_visitor_opt_out: lb?.allow_visitor_opt_out ?? true,
      });
      setIsEditingLeaderboard(true);
    }
  }, [bundle, canEdit, form, checkinForm, lbForm]);

  function startEdit() {
    if (!bundle) return;
    const e = bundle.event;
    setForm({
      name: e.name ?? "",
      description: e.description ?? "",
      timezone: e.timezone ?? "",
      starts_at: toLocalInput(e.starts_at),
      ends_at: toLocalInput(e.ends_at),
    });
    setValidationError(null);
    setSaveError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setForm(null);
    setValidationError(null);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!form || !agencyId || !bundle) return;
    const name = form.name.trim();
    const timezone = form.timezone.trim();
    if (!name) {
      setValidationError("Name is required.");
      return;
    }
    if (!timezone) {
      setValidationError("Timezone is required.");
      return;
    }
    const startsIso = fromLocalInput(form.starts_at);
    const endsIso = fromLocalInput(form.ends_at);
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
      setValidationError("End date/time must be after start date/time.");
      return;
    }
    setValidationError(null);
    setSaveError(null);
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({
        name,
        description: form.description.trim() || null,
        timezone,
        starts_at: startsIso,
        ends_at: endsIso,
      })
      .eq("id", bundle.event.id)
      .eq("agency_id", agencyId);
    setSaving(false);
    if (error) {
      setSaveError("Could not save changes. Please try again.");
      return;
    }
    setBasicsSaveSuccess(true);
    window.setTimeout(() => setBasicsSaveSuccess(false), 2500);
    setReloadKey((k) => k + 1);
  }




  function startEditCheckin() {
    if (!bundle) return;
    setCheckinForm({
      one_checkin_per_venue: bundle.checkin?.one_checkin_per_venue ?? true,
      minimum_seconds_between_checkins: String(bundle.checkin?.minimum_seconds_between_checkins ?? 0),
      allow_manual_admin_checkins: bundle.checkin?.allow_manual_admin_checkins ?? false,
      max_checkins_per_passport_per_day:
        bundle.checkin?.max_checkins_per_passport_per_day === null ||
        bundle.checkin?.max_checkins_per_passport_per_day === undefined
          ? ""
          : String(bundle.checkin.max_checkins_per_passport_per_day),
    });
    setCheckinValidationError(null);
    setCheckinSaveError(null);
    setIsEditingCheckin(true);
  }

  function cancelEditCheckin() {
    setIsEditingCheckin(false);
    setCheckinForm(null);
    setCheckinValidationError(null);
    setCheckinSaveError(null);
  }

  async function saveEditCheckin() {
    if (!checkinForm || !agencyId || !bundle) return;

    const minSeconds = parseInt(checkinForm.minimum_seconds_between_checkins, 10);
    if (Number.isNaN(minSeconds) || minSeconds < 0) {
      setCheckinValidationError("Minimum seconds must be a whole number >= 0.");
      return;
    }

    let maxPerDay: number | null = null;
    if (checkinForm.max_checkins_per_passport_per_day.trim() !== "") {
      const parsed = parseInt(checkinForm.max_checkins_per_passport_per_day.trim(), 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        setCheckinValidationError(
          "Max check-ins per passport per day must be a whole number >= 1, or left blank."
        );
        return;
      }
      maxPerDay = parsed;
    }

    setCheckinValidationError(null);
    setCheckinSaveError(null);
    setCheckinSaving(true);

    let error: { message: string } | null = null;
    if (bundle.checkin) {
      const { error: upErr } = await supabase
        .from("event_checkin_settings")
        .update({
          one_checkin_per_venue: checkinForm.one_checkin_per_venue,
          minimum_seconds_between_checkins: minSeconds,
          allow_manual_admin_checkins: checkinForm.allow_manual_admin_checkins,
          max_checkins_per_passport_per_day: maxPerDay,
        })
        .eq("event_id", eventId)
        .eq("agency_id", agencyId);
      error = upErr ?? null;
    } else {
      const { error: inErr } = await supabase
        .from("event_checkin_settings")
        .insert({
          agency_id: agencyId,
          event_id: eventId,
          one_checkin_per_venue: checkinForm.one_checkin_per_venue,
          minimum_seconds_between_checkins: minSeconds,
          allow_manual_admin_checkins: checkinForm.allow_manual_admin_checkins,
          max_checkins_per_passport_per_day: maxPerDay,
        });
      error = inErr ?? null;
    }

    setCheckinSaving(false);
    if (error) {
      setCheckinSaveError("Could not save check-in settings. Please try again.");
      return;
    }
    setCheckinSaveSuccess(true);
    window.setTimeout(() => setCheckinSaveSuccess(false), 2500);
    setReloadKey((k) => k + 1);
  }

  function startEditLeaderboard() {
    if (!bundle) return;
    const lb = bundle.leaderboard;
    const mode = (lb?.display_mode ?? "first_name_last_initial") as LeaderboardDisplayMode;
    setLbForm({
      is_enabled: lb?.is_enabled ?? false,
      display_mode: (LEADERBOARD_DISPLAY_MODES as readonly string[]).includes(mode)
        ? mode
        : "first_name_last_initial",
      show_first_name: lb?.show_first_name ?? true,
      show_last_initial: lb?.show_last_initial ?? true,
      show_visit_count: lb?.show_visit_count ?? false,
      hide_below_checkins: String(lb?.hide_below_checkins ?? 0),
      allow_visitor_opt_out: lb?.allow_visitor_opt_out ?? true,
    });
    setLbValidationError(null);
    setLbSaveError(null);
    setIsEditingLeaderboard(true);
  }

  function cancelEditLeaderboard() {
    setIsEditingLeaderboard(false);
    setLbForm(null);
    setLbValidationError(null);
    setLbSaveError(null);
  }

  async function saveEditLeaderboard() {
    if (!lbForm || !agencyId || !bundle) return;

    if (!(LEADERBOARD_DISPLAY_MODES as readonly string[]).includes(lbForm.display_mode)) {
      setLbValidationError("Invalid display mode.");
      return;
    }
    const hideBelow = parseInt(lbForm.hide_below_checkins, 10);
    if (Number.isNaN(hideBelow) || hideBelow < 0 || !Number.isFinite(hideBelow)) {
      setLbValidationError("Hide below check-ins must be a whole number >= 0.");
      return;
    }

    setLbValidationError(null);
    setLbSaveError(null);
    setLbSaving(true);

    const payload = {
      is_enabled: lbForm.is_enabled,
      display_mode: lbForm.display_mode,
      show_first_name: lbForm.show_first_name,
      show_last_initial: lbForm.show_last_initial,
      show_visit_count: lbForm.show_visit_count,
      hide_below_checkins: hideBelow,
      allow_visitor_opt_out: lbForm.allow_visitor_opt_out,
    };

    let error: { message: string } | null = null;
    if (bundle.leaderboard) {
      const { error: upErr } = await supabase
        .from("leaderboard_settings")
        .update(payload)
        .eq("event_id", eventId)
        .eq("agency_id", agencyId);
      error = upErr ?? null;
    } else {
      const { error: inErr } = await supabase
        .from("leaderboard_settings")
        .insert({ agency_id: agencyId, event_id: eventId, ...payload });
      error = inErr ?? null;
    }

    setLbSaving(false);
    if (error) {
      setLbSaveError("Could not save leaderboard settings. Please try again.");
      return;
    }
    setLbSaveSuccess(true);
    window.setTimeout(() => setLbSaveSuccess(false), 2500);
    setReloadKey((k) => k + 1);
  }

  function startCreateVenue() {
    if (!bundle) return;
    const nextOrder = bundle.venues.length
      ? Math.max(...bundle.venues.map((v) => v.order_index)) + 1
      : 0;
    setVenueForm({
      name: "",
      address: "",
      lat: "",
      lng: "",
      order_index: String(nextOrder),
      status: "active",
      description: "",
      offer_summary: "",
      website_url: "",
      phone: "",
      logo_path: null,
      cover_path: null,
    });
    setVenueAssetError(null);
    setVenueValidationError(null);
    setVenueSaveError(null);
    setVenueSaveDebug(null);
    setVenueEditingId("new");
  }

  function startEditVenue(v: Venue) {
    setVenueForm({
      name: v.name ?? "",
      address: v.address ?? "",
      lat: v.lat === null || v.lat === undefined ? "" : String(v.lat),
      lng: v.lng === null || v.lng === undefined ? "" : String(v.lng),
      order_index: String(v.order_index ?? 0),
      status: v.status === "inactive" ? "inactive" : "active",
      description: v.description ?? "",
      offer_summary: bundle?.offerSummaryByVenue.get(v.id) ?? "",
      website_url: v.website_url ?? "",
      phone: v.phone ?? "",
      logo_path: v.logo_path ?? null,
      cover_path: v.cover_path ?? null,
    });
    setVenueAssetError(null);
    setVenueValidationError(null);
    setVenueSaveError(null);
    setVenueSaveDebug(null);
    setVenueEditingId(v.id);
    requestAnimationFrame(() => {
      venueEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function cancelVenueEdit() {
    setVenueEditingId(null);
    setVenueForm(null);
    setMapPickerOpen(false);
    setVenueValidationError(null);
    setVenueSaveError(null);
    setVenueSaveDebug(null);
    // Refresh in case a venue was just created (we skipped reload then to keep
    // the editor mounted for image upload).
    setReloadKey((k) => k + 1);
  }

  async function saveVenue() {
    if (!venueForm || !agencyId || !bundle || !venueEditingId) return;
    const route = "client saveVenue in src/routes/admin.events.$eventId.tsx";

    const name = venueForm.name.trim();
    if (!name) {
      setVenueValidationError("Name is required.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: name is required.",
      });
      return;
    }
    if (name.length > 150) {
      setVenueValidationError("Name must be 150 characters or fewer.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: name exceeded 150 characters.",
      });
      return;
    }
    const addressRaw = venueForm.address.trim();
    if (addressRaw.length > 300) {
      setVenueValidationError("Address must be 300 characters or fewer.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: address exceeded 300 characters.",
      });
      return;
    }
    const address = addressRaw === "" ? null : addressRaw;

    let lat: number | null = null;
    if (venueForm.lat.trim() !== "") {
      const parsed = Number(venueForm.lat.trim());
      if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
        setVenueValidationError("Latitude must be a number between -90 and 90.");
        setVenueSaveDebug({
          route,
          action: "validation",
          payloadKeys: [],
          venueId: venueEditingId,
          eventId,
          agencyId,
          message: "Validation blocked the save before Supabase was reached: latitude was outside -90 to 90.",
        });
        return;
      }
      lat = parsed;
    }
    let lng: number | null = null;
    if (venueForm.lng.trim() !== "") {
      const parsed = Number(venueForm.lng.trim());
      if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
        setVenueValidationError("Longitude must be a number between -180 and 180.");
        setVenueSaveDebug({
          route,
          action: "validation",
          payloadKeys: [],
          venueId: venueEditingId,
          eventId,
          agencyId,
          message: "Validation blocked the save before Supabase was reached: longitude was outside -180 to 180.",
        });
        return;
      }
      lng = parsed;
    }
    const orderIndex = parseInt(venueForm.order_index, 10);
    if (Number.isNaN(orderIndex) || orderIndex < 0) {
      setVenueValidationError("Order must be a whole number >= 0.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: order was not a whole number >= 0.",
      });
      return;
    }
    if (venueForm.status !== "active" && venueForm.status !== "inactive") {
      setVenueValidationError("Status must be active or inactive.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: status was not active or inactive.",
      });
      return;
    }

    const description = venueForm.description.trim();
    if (description.length > 1200) {
      setVenueValidationError("Description must be 1200 characters or fewer.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: description exceeded 1200 characters.",
      });
      return;
    }
    const offerSummary = venueForm.offer_summary.trim();
    if (bundle.offerSupported && offerSummary.length > 800) {
      setVenueValidationError("Offer summary must be 800 characters or fewer.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: offer summary exceeded 800 characters.",
      });
      return;
    }
    const website = venueForm.website_url.trim();
    if (website.length > 0 && !/^https:\/\//i.test(website)) {
      setVenueValidationError("Website URL must start with https://");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: website URL did not start with https://.",
      });
      return;
    }
    const phone = venueForm.phone.trim();
    if (phone.length > 40) {
      setVenueValidationError("Phone must be 40 characters or fewer.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: phone exceeded 40 characters.",
      });
      return;
    }
    if (phone.length > 0 && !/^\+?[0-9 \-]{6,40}$/.test(phone)) {
      setVenueValidationError("Phone may only contain digits, spaces, dashes, and an optional leading +.");
      setVenueSaveDebug({
        route,
        action: "validation",
        payloadKeys: [],
        venueId: venueEditingId,
        eventId,
        agencyId,
        message: "Validation blocked the save before Supabase was reached: phone contained unsupported characters.",
      });
      return;
    }

    setVenueValidationError(null);
    setVenueSaveError(null);
    setVenueSaveDebug(null);
    setVenueSaving(true);

    const patch: Record<string, unknown> = {
      name,
      address,
      lat,
      lng,
      order_index: orderIndex,
      status: venueForm.status,
      description: description === "" ? null : description,
      website_url: website === "" ? null : website,
      phone: phone === "" ? null : phone,
    };
    if (bundle.offerSupported) {
      patch.offer_summary = offerSummary === "" ? null : offerSummary;
    }

    const payloadKeys = Object.keys(patch);
    const failVenueSave = (debug: VenueSaveDebug) => {
      console.error("[venue-save] failed", debug);
      const msg = formatVenueSaveFailure(debug);
      setVenueSaveDebug(debug);
      setVenueSaveError(msg);
      toast.error(msg);
    };

    console.info("[venue-save] started", {
      route,
      action: venueEditingId === "new" ? "insert" : "update",
      payloadKeys,
      venueId: venueEditingId,
      eventId,
      agencyId,
    });

    try {
      let newVenueId: string | null = null;
      if (venueEditingId === "new") {
        // Venue creation guard: check organisation plan limit before inserting.
        const [subRes, countRes] = await Promise.all([
          supabase
            .from("agency_subscriptions")
            .select("id, plan_code, status")
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

        if (subRes.error) {
          failVenueSave(venueSaveDebugFromError({
            action: "preflight",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            error: subRes.error,
            httpStatus: subRes.status,
            httpStatusText: subRes.statusText,
          }));
          return;
        }
        if (countRes.error) {
          failVenueSave(venueSaveDebugFromError({
            action: "preflight",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            error: countRes.error,
            httpStatus: countRes.status,
            httpStatusText: countRes.statusText,
          }));
          return;
        }

        const plan = getPlanByCode(subRes.data?.plan_code);
        const activeVenueCount = countRes.count ?? 0;
        const venueLimit = plan.venueLimit;

        if (venueLimit !== null && activeVenueCount >= venueLimit) {
          const nextPlan = getNextPlanAfter(plan.code);
          const nextName = nextPlan?.name ?? "a higher plan";
          const limitMessage = `Your ${plan.name} plan includes up to ${venueLimit} venues. Upgrade to ${nextName} to add more venues.`;
          setVenueValidationError(limitMessage);
          setVenueSaveDebug({
            route,
            action: "preflight",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            message: `Venue creation blocked before insert by active venue limit. Active venues counted: ${activeVenueCount}. Limit: ${venueLimit}.`,
          });
          return;
        }

        console.info("[venue-save] calling Supabase insert", { route, payloadKeys, eventId, agencyId });
        const { data: insData, error: inErr, status, statusText } = await supabase
          .from("venues")
          .insert({
            agency_id: agencyId,
            event_id: eventId,
            ...patch,
          })
          .select("id")
          .single();
        if (inErr) {
          failVenueSave(venueSaveDebugFromError({
            action: "insert",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            error: inErr,
            httpStatus: status,
            httpStatusText: statusText,
          }));
          return;
        }
        newVenueId = (insData?.id as string | undefined) ?? null;
        if (!newVenueId) {
          failVenueSave({
            route,
            action: "insert",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            message: "Supabase insert returned no error, but the created venue id was missing from the response.",
            httpStatus: status,
            httpStatusText: statusText,
            matchedRows: 0,
          });
          return;
        }
      } else {
        console.info("[venue-save] calling Supabase update", {
          route,
          payloadKeys,
          venueId: venueEditingId,
          eventId,
          agencyId,
        });
        const { data: updatedVenue, error: upErr, status, statusText } = await supabase
          .from("venues")
          .update(patch)
          .eq("id", venueEditingId)
          .eq("event_id", eventId)
          .eq("agency_id", agencyId)
          .select("id")
          .maybeSingle();
        if (upErr) {
          failVenueSave(venueSaveDebugFromError({
            action: "update",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            error: upErr,
            httpStatus: status,
            httpStatusText: statusText,
          }));
          return;
        }
        if (!updatedVenue) {
          failVenueSave({
            route,
            action: "update",
            payloadKeys,
            venueId: venueEditingId,
            eventId,
            agencyId,
            message: "Supabase update completed with no error, but matched 0 venue rows. The venue may be deleted, belong to another event/organisation, or be hidden by permissions.",
            httpStatus: status,
            httpStatusText: statusText,
            matchedRows: 0,
          });
          return;
        }
      }

      console.info("[venue-save] Supabase mutation succeeded", {
        route,
        action: venueEditingId === "new" ? "insert" : "update",
        venueId: venueEditingId === "new" ? newVenueId : venueEditingId,
        eventId,
        agencyId,
      });
      if (venueEditingId === "new" && newVenueId) {
        // Keep editor open in edit mode so image upload becomes available immediately.
        // Do NOT trigger a full reload here — that would flip state to "loading" and
        // unmount the editor. The new venue will appear in the list when the user
        // saves again or cancels.
        setVenueEditingId(newVenueId);
        toast.success("Venue created. Add public details, images and QR next.");
        // Scroll the editor into view so the user sees the new full-detail panel.
        requestAnimationFrame(() => {
          venueEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        setVenueEditingId(null);
        setVenueForm(null);
        setMapPickerOpen(false);
        toast.success("Venue saved.");
        setReloadKey((k) => k + 1);
      }
    } catch (exception) {
      failVenueSave(venueSaveDebugFromError({
        action: "exception",
        payloadKeys,
        venueId: venueEditingId,
        eventId,
        agencyId,
        error: exception,
      }));
    } finally {
      setVenueSaving(false);
    }
  }

  async function uploadVenueImage(kind: VenueAssetKind, file: File) {
    if (!venueForm || !venueEditingId || venueEditingId === "new" || !agencyId) return;
    setVenueAssetError(null);
    setVenueAssetBusy(kind);
    const previous = kind === "logo" ? venueForm.logo_path : venueForm.cover_path;
    const result = await uploadVenueAsset({
      agencyId,
      eventId,
      venueId: venueEditingId,
      kind,
      file,
    });
    if (!result.ok) {
      setVenueAssetBusy(null);
      setVenueAssetError(result.error);
      return;
    }
    const column = kind === "logo" ? "logo_path" : "cover_path";
    const { error: dbErr } = await supabase
      .from("venues")
      .update({ [column]: result.path })
      .eq("id", venueEditingId)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);
    if (dbErr) {
      await deleteVenueAssetSafely(result.path);
      setVenueAssetBusy(null);
      setVenueAssetError(`Could not update venue: ${dbErr.message}`);
      return;
    }
    setVenueForm({
      ...venueForm,
      [column]: result.path,
    } as VenueEditForm);
    if (previous && previous !== result.path) {
      await deleteVenueAssetSafely(previous);
    }
    setVenueAssetBusy(null);
    // Do not reloadKey here — that would flip the page into loading state and
    // unmount the editor. venueForm is already updated locally.
  }

  async function removeVenueImage(kind: VenueAssetKind) {
    if (!venueForm || !venueEditingId || venueEditingId === "new" || !agencyId) return;
    const previous = kind === "logo" ? venueForm.logo_path : venueForm.cover_path;
    if (!previous) return;
    setVenueAssetError(null);
    setVenueAssetBusy(kind);
    const column = kind === "logo" ? "logo_path" : "cover_path";
    const { error: dbErr } = await supabase
      .from("venues")
      .update({ [column]: null })
      .eq("id", venueEditingId)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);
    if (dbErr) {
      setVenueAssetBusy(null);
      setVenueAssetError(`Could not remove image: ${dbErr.message}`);
      return;
    }
    await deleteVenueAssetSafely(previous);
    setVenueForm({
      ...venueForm,
      [column]: null,
    } as VenueEditForm);
    setVenueAssetBusy(null);
    // See uploadVenueImage: skip reloadKey to keep the editor mounted.
  }

  async function disableVenue(venueId: string) {
    if (!agencyId) return;
    if (
      !window.confirm(
        "Disable this venue?\n\nThis venue will no longer count toward your venue limit and cannot be selected for new events. Existing events, check-ins, QR codes, and historical reporting will remain intact.\n\nAfter disabling, you can permanently delete this venue from the Disabled tab if it has no linked event or check-in history.",
      )
    ) {
      return;
    }
    setVenueArchivingId(venueId);
    setVenueArchiveError(null);
    const { error } = await supabase.rpc("disable_venue", {
      p_venue_id: venueId,
      p_reason: null,
    });
    setVenueArchivingId(null);
    if (error) {
      setVenueArchiveError(error.message || "Could not disable venue. Please try again.");
      toast.error(error.message || "Could not disable venue.");
      return;
    }
    toast.success("Venue disabled.");
    setReloadKey((k) => k + 1);
  }

  async function reactivateVenue(venueId: string) {
    if (!agencyId) return;
    setVenueArchivingId(venueId);
    setVenueArchiveError(null);
    const { error } = await supabase.rpc("reactivate_venue", {
      p_venue_id: venueId,
    });
    setVenueArchivingId(null);
    if (error) {
      setVenueArchiveError(error.message || "Could not reactivate venue.");
      toast.error(error.message || "Could not reactivate venue.");
      return;
    }
    toast.success("Venue reactivated.");
    setReloadKey((k) => k + 1);
  }

  async function hardDeleteVenue(venueId: string) {
    if (!agencyId) return;
    if (
      !window.confirm(
        "Permanently delete this venue?\n\nThis cannot be undone. Only venues with no linked events or historical activity can be permanently deleted.",
      )
    ) {
      return;
    }
    setVenueArchivingId(venueId);
    setVenueArchiveError(null);
    const { error } = await supabase.rpc("hard_delete_venue", {
      p_venue_id: venueId,
    });
    setVenueArchivingId(null);
    if (error) {
      setVenueArchiveError(error.message || "Could not delete venue.");
      toast.error(error.message || "Could not delete venue.");
      return;
    }
    toast.success("Venue permanently deleted.");
    setReloadKey((k) => k + 1);
  }

  async function runForceDeleteVenue() {
    const venueId = forceDeleteVenueId;
    if (!venueId) return;
    if (forceDeleteConfirm !== "DELETE VENUE AND HISTORY") {
      setForceDeleteError(
        'Type "DELETE VENUE AND HISTORY" exactly to confirm.',
      );
      return;
    }
    setForceDeleteBusy(true);
    setForceDeleteError(null);
    const { error } = await supabase.rpc("force_delete_venue", {
      p_venue_id: venueId,
      p_confirm_text: forceDeleteConfirm,
    });
    setForceDeleteBusy(false);
    if (error) {
      const e = error as { message?: string; details?: string; hint?: string; code?: string };
      const parts = [e.message, e.details, e.hint].filter(Boolean) as string[];
      const base = parts.length > 0 ? parts.join(" — ") : "Force delete failed.";
      const msg = e.code ? `${base} [pg ${e.code}]` : base;
      setForceDeleteError(msg);
      toast.error(msg);
      return;
    }
    setForceDeleteVenueId(null);
    setForceDeleteConfirm("");
    toast.success("Venue and linked history permanently deleted.");
    setReloadKey((k) => k + 1);
  }

  async function archiveEvent() {
    if (!agencyId || !bundle) return;
    if (
      !window.confirm(
        "Archive this event? It will be removed from active admin lists and public access. Existing records (venues, visitors, check-ins) are kept for audit/history.",
      )
    ) {
      return;
    }
    setDeleting(true);
    const { error } = await supabase
      .from("events")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", bundle.event.id)
      .eq("agency_id", agencyId);
    if (error) {
      setDeleting(false);
      toast.error(`Could not archive event: ${error.message}`);
      return;
    }
    toast.success("Event archived.");
    navigate({ to: "/admin/events", replace: true });
  }

  /**
   * Build the check-in URL for a QR token.
   * Prefers the event's active public_subdomain domain. Falls back to the
   * in-app /demo/checkin/$venueId route in staging/preview.
   */
  function qrFilename(eventSlug: string, venueName: string): string {
    const slug = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    const e = slug(eventSlug || "event") || "event";
    const v = slug(venueName || "venue") || "venue";
    return `getstampd-${e}-${v}-qr`;
  }

  function buildCheckinUrl(token: string): { url: string; isFallback: boolean } {
    const sub = (bundle?.domains ?? []).find(
      (d) =>
        d.domain_type === "event_subdomain" &&
        d.status === "active" &&
        !!d.public_subdomain,
    );
    if (sub?.public_subdomain) {
      return {
        url: `https://${sub.public_subdomain}.getstampd.com.au/checkin/${token}`,
        isFallback: false,
      };
    }
    return { url: `/demo/checkin/${token}`, isFallback: true };
  }

  async function revealQr(venueId: string) {
    if (!agencyId || !canEdit) return;
    setQrActionError(null);
    setQrActionVenueId(venueId);
    const { data, error } = await supabase
      .from("venue_qr_codes")
      .select("token")
      .eq("venue_id", venueId)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId)
      .eq("status", "active")
      .maybeSingle();
    setQrActionVenueId(null);
    if (error || !data?.token) {
      setQrActionError("Could not load QR token. Please try again.");
      return;
    }
    setRevealedQrByVenue((m) => {
      const next = new Map(m);
      next.set(venueId, data.token as string);
      return next;
    });
  }

  function hideQr(venueId: string) {
    setRevealedQrByVenue((m) => {
      const next = new Map(m);
      next.delete(venueId);
      return next;
    });
  }

  async function copyQrLink(venueId: string) {
    if (!canEdit) return;
    let token = revealedQrByVenue.get(venueId);
    if (!token) {
      setQrActionError(null);
      setQrActionVenueId(venueId);
      const { data, error } = await supabase
        .from("venue_qr_codes")
        .select("token")
        .eq("venue_id", venueId)
        .eq("event_id", eventId)
        .eq("agency_id", agencyId!)
        .eq("status", "active")
        .maybeSingle();
      setQrActionVenueId(null);
      if (error || !data?.token) {
        setQrActionError("Could not load QR token. Please try again.");
        return;
      }
      token = data.token as string;
    }
    const { url } = buildCheckinUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setQrCopiedVenueId(venueId);
      setTimeout(() => {
        setQrCopiedVenueId((id) => (id === venueId ? null : id));
      }, 1500);
    } catch {
      setQrActionError("Could not copy to clipboard.");
    }
  }

  async function generateOrRotateQr(venueId: string, isRotate: boolean) {
    if (!agencyId || !canEdit) return;
    if (isRotate) {
      const ok = window.confirm(
        "Rotate this venue's QR? The previous QR code will stop working immediately and any printed posters using it must be replaced.",
      );
      if (!ok) return;
    }
    setQrActionError(null);
    setQrSupportDetails(null);
    setQrSupportCopied(false);
    setQrActionVenueId(venueId);

    // Probe existing active QR row before mutating, for support details.
    let hadActiveQrBefore: boolean | null = null;
    let hadEntryValueColumn: boolean | null = null;
    try {
      const probe = await supabase
        .from("venue_qr_codes")
        .select("id, entry_value")
        .eq("venue_id", venueId)
        .eq("event_id", eventId)
        .eq("agency_id", agencyId)
        .eq("status", "active")
        .maybeSingle();
      if (!probe.error) {
        hadActiveQrBefore = Boolean(probe.data);
        hadEntryValueColumn = probe.data ? "entry_value" in (probe.data as object) : null;
      } else if (probe.error.message?.includes("entry_value")) {
        hadEntryValueColumn = false;
      }
    } catch { /* ignore probe failure */ }

    const venueRow = venues.find((vv) => vv.id === venueId);
    const rpcPayload = { _venue_id: venueId };
    const { error } = await supabase.rpc("rotate_venue_qr", rpcPayload);
    setQrActionVenueId(null);
    if (error) {
      const details = {
        timestamp: new Date().toISOString(),
        event_id: eventId,
        venue_id: venueId,
        venue_status: venueRow?.status ?? null,
        event_status: event?.status ?? null,
        rpc_name: "rotate_venue_qr",
        rpc_payload_keys: Object.keys(rpcPayload),
        action: isRotate ? "rotate" : "generate",
        supabase_error: {
          code: (error as { code?: string }).code ?? null,
          message: error.message ?? null,
          details: (error as { details?: string }).details ?? null,
          hint: (error as { hint?: string }).hint ?? null,
        },
        had_active_qr_before: hadActiveQrBefore,
        entry_value_column_present: hadEntryValueColumn,
      };
      setQrActionError(
        `${isRotate ? "Could not rotate QR" : "Could not generate QR"}: ${
          error.message ?? "unknown error"
        }`,
      );
      setQrSupportDetails(JSON.stringify(details, null, 2));
      return;
    }
    // Token stays hidden after generate/rotate; admin must explicitly reveal.
    setRevealedQrByVenue((m) => {
      const next = new Map(m);
      next.delete(venueId);
      return next;
    });
    setReloadKey((k) => k + 1);
  }

  async function copyQrSupportDetails() {
    if (!qrSupportDetails) return;
    try {
      await navigator.clipboard.writeText(qrSupportDetails);
      setQrSupportCopied(true);
      setTimeout(() => setQrSupportCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }


  async function saveQrEntryValue(venueId: string, raw: string) {
    if (!agencyId || !canEdit) return;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
      setQrActionError("Entry value must be a whole number between 1 and 100.");
      return;
    }
    setQrActionError(null);
    setQrEntrySavingId(venueId);
    const { error } = await supabase
      .from("venue_qr_codes")
      .update({ entry_value: parsed })
      .eq("venue_id", venueId)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId)
      .eq("status", "active");
    setQrEntrySavingId(null);
    if (error) {
      setQrActionError("Could not save entry value. Please try again.");
      return;
    }
    setQrEntryDraft((m) => {
      const next = new Map(m);
      next.delete(venueId);
      return next;
    });
    setReloadKey((k) => k + 1);
  }



  if (eventId === "new") {
    return (
      <>
        <PageHeader title="New event" description="Event creation is not enabled yet." />
        <EmptyNotice>Creating events will be available in a later milestone.</EmptyNotice>
      </>
    );
  }

  if (state === "loading") {
    return (
      <>
        <PageHeader title="Event detail" description="Loading event…" />
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      </>
    );
  }

  if (state === "not-found") {
    return (
      <>
        <PageHeader title="Event not found" description="" />
        <EmptyNotice>
          This event does not exist for your organisation, or you do not have access to it.{" "}
          <Link to="/admin/events" className="font-medium text-primary hover:underline">
            Back to events
          </Link>
          .
        </EmptyNotice>
        {agency.isPlatformAdmin && diagnosticsEnabled && (
          <LoadDiagnosticPanel
            diagnostic={diagnostic}
            eventId={eventId}
            agencyId={agencyId}
            userId={auth.session?.user.id ?? null}
            email={auth.email}
          />
        )}
      </>
    );
  }

  if (state === "error" || !bundle) {
    return (
      <>
        <PageHeader title="Event detail" description="" />
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load event detail.{" "}
          <Link to="/admin/events" className="font-medium underline">
            Back to events
          </Link>
          .
        </div>
        {agency.isPlatformAdmin && diagnosticsEnabled && (
          <LoadDiagnosticPanel
            diagnostic={diagnostic}
            eventId={eventId}
            agencyId={agencyId}
            userId={auth.session?.user.id ?? null}
            email={auth.email}
          />
        )}
      </>
    );
  }

  const { event, branding, domains, terms, checkin, leaderboard, venues, qrByVenue, offerSummaryByVenue, activation } = bundle;

  const activeSub =
    domains.find(
      (d) =>
        d.domain_type === "event_subdomain" &&
        d.status === "active" &&
        d.is_primary,
    ) ??
    domains.find(
      (d) => d.domain_type === "event_subdomain" && d.status === "active",
    ) ??
    null;
  const activeSubdomain = activeSub?.public_subdomain ?? null;

  const statusPillClass =
    event.status === "published"
      ? "bg-[#ECFDF5] text-[#047857] border-[#86EFAC]"
      : event.status === "archived"
        ? "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
        : "bg-[#FFF7ED] text-[#B45309] border-[#FDBA74]";
  const statusLabel =
    event.status === "published"
      ? "Published"
      : event.status === "archived"
        ? "Archived"
        : "Draft";

  return (
    <>
      <PageHeader
        title={event.name}
        description={undefined}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/admin/events/$eventId/preview"
              params={{ eventId: bundle.event.id }}
              target="_blank"
              className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#F8FAFC]"
            >
              Preview customer page
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={archiveEvent}
                disabled={deleting}
                title="Archive this event (soft delete). Existing records are preserved."
                className="inline-flex h-10 items-center rounded-[10px] border border-[#FDA4AF] bg-white px-4 text-sm font-semibold text-[#E11D48] hover:bg-[#FFF1F2] disabled:opacity-50"
              >
                {deleting ? "Archiving…" : "Archive event"}
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusPillClass}`}
        >
          {statusLabel}
        </span>
        {activeSubdomain ? (
          <a
            href={`https://${activeSubdomain}.getstampd.com.au`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[#86EFAC] bg-[#ECFDF5] px-3 py-1 text-xs font-semibold text-[#047857] hover:bg-emerald-100"
          >
            Live at {activeSubdomain}.getstampd.com.au
          </a>
        ) : (
          <span className="inline-flex items-center rounded-full border border-[#FECACA] bg-[#FEF2F2] px-3 py-1 text-xs font-semibold text-[#B91C1C]">
            Public address not claimed
          </span>
        )}
      </div>

      <details className="group rounded-[16px] border border-[#D9E2EF] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[#111827]">Setup &amp; launch status</span>
            <span className="text-sm text-[#64748B]">
              Checklist, blockers and go-live gates
            </span>
          </span>
          <span className="text-sm font-medium text-[#334155] hover:text-[#1F56C5] group-open:hidden">
            Show
          </span>
          <span className="hidden text-sm font-medium text-[#334155] hover:text-[#1F56C5] group-open:inline">
            Hide
          </span>
        </summary>
        <div className="space-y-4 border-t border-[#E6ECF4] px-5 py-5">
          <LaunchReadinessChecklist
            event={event}
            domains={domains}
            terms={terms}
            venues={venues}
            qrByVenue={qrByVenue}
            activation={activation}
            leaderboard={leaderboard}
          />

          <EventSetupWarnings
            status={event.status}
            domains={domains}
            hasTerms={!!terms}
            hasVenues={venues.length > 0}
            eventId={event.id}
          />

          {agency.isPlatformAdmin && diagnosticsEnabled && (
            <PublishGateDiagnostic
              event={event}
              domains={domains}
              activation={activation}
              terms={terms}
              checkin={checkin}
              venues={venues}
            />
          )}

          <div id="section-go-live">
            <GoLivePanel
              agencyId={agencyId}
              eventId={event.id}
              eventStatus={event.status}
              domains={domains}
              activation={activation}
              isPlatformAdmin={agency.isPlatformAdmin}
              onChanged={() => setReloadKey((k) => k + 1)}
            />
          </div>
        </div>
      </details>

      <EventTabBar active={activeTab} onChange={setActiveTab} />


      <EventTabContext.Provider value={activeTab}>
        <div className="min-h-[60vh] space-y-6">
          <Section title="Basics" tab="details">
            {isEditing && form ? (
              <div className="space-y-4">
                {(validationError || saveError) && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {validationError ?? saveError}
                  </div>
                )}
                <Field label="Name" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    maxLength={200}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
                    maxLength={2000}
                  />
                </Field>
                <Field label="Timezone (IANA)" required>
                  <input
                    type="text"
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    placeholder="e.g. Europe/London"
                    className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    maxLength={64}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Starts at">
                    <input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                  </Field>
                  <Field label="Ends at">
                    <input
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                  </Field>
                </div>
                <p className="text-xs leading-5 text-[#64748B]">
                  Internal event URL name, public event code, and status remain read-only here.
                </p>
                {basicsSaveSuccess && (
                  <div className="rounded-[12px] border border-[#86EFAC] bg-[#ECFDF5] px-4 py-3 text-sm text-[#047857]">
                    Basics saved.
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 border-t border-[#E6ECF4] pt-5">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:opacity-50"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <DefList
                rows={[
                  ["Name", event.name],
                  ["Internal event URL name", event.slug],
                  ["Public event code", event.public_slug ?? "—"],
                  ["Status", event.status],
                  ["Timezone", event.timezone],
                  ["Starts at", fmt(event.starts_at)],
                  ["Ends at", fmt(event.ends_at)],
                  ["Description", event.description ?? "—"],
                  ["Created", fmt(event.created_at)],
                  ["Updated", fmt(event.updated_at)],
                ]}
              />
            )}
          </Section>


          <Section title="Branding" id="section-branding" tab="branding">
            <p className="mb-4 text-sm text-muted-foreground">
              Branding is now edited side-by-side with a live preview of the customer landing page.
            </p>
            <div className="mb-4 flex justify-end">
              <Link
                to="/admin/events/$eventId/branding"
                params={{ eventId: bundle.event.id }}
                className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Edit customer landing page
              </Link>
            </div>
            {branding ? (
              <BrandingSummary branding={branding} />
            ) : (
              <EmptyNotice>No branding configured yet.</EmptyNotice>
            )}
          </Section>


          <Section title="Public address" id="section-public-address" tab="overview">
            <PublicAddressCard
              agencyId={agencyId}
              eventId={event.id}
              publicSlug={event.public_slug}
              internalSlug={event.slug}
              eventName={event.name}
              domains={domains}
              canEdit={canEdit}
              isPlatformAdmin={agency.isPlatformAdmin}
              onChanged={() => setReloadKey((k) => k + 1)}
            />
          </Section>

          <Section title="Announcements" id="section-announcements" description="Customer-facing notices shown at the top of public event pages." tab="overview">
            <AdminEventAnnouncements
              eventId={event.id}
              agencyId={event.agency_id}
              canEdit={canEdit}
            />
          </Section>

          <Section title="Marketing assets" id="section-marketing" tab="overview" description="Printable poster with a QR code linking to your public event page.">
            <AdminEventPoster
              canEdit={canEdit}
              event={{
                name: event.name,
                slug: event.slug,
                public_slug: event.public_slug,
                description: event.description,
                starts_at: event.starts_at,
                ends_at: event.ends_at,
                timezone: event.timezone,
              }}
              branding={branding}
              logoUrl={getEventAssetPublicUrl(branding?.logo_path)}
              coverUrl={getEventAssetPublicUrl(branding?.cover_path)}
              activePublicSubdomain={activeSubdomain}
            />
          </Section>



          <Section title="Terms & privacy" id="section-terms" tab="terms">
            <div className="mb-4 rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm leading-6 text-[#334155]">
              These terms are shown to visitors before they join the event passport. Keep them clear, concise, and specific to this event.
            </div>
            {terms ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-full border border-[#86EFAC] bg-[#ECFDF5] px-3 py-1 text-xs font-semibold text-[#047857]">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                    Active
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setTermsDialogOpen(true)}
                      className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]"
                    >
                      Update terms & privacy
                    </button>
                  )}
                </div>
                <DefList
                  rows={
                    terms.legal_source === "local_text"
                      ? [
                          ["Source", "GetStampd local pages"],
                          ["Version", terms.terms_version],
                          ["Terms title", terms.terms_title ?? "—"],
                          ["Privacy title", terms.privacy_title ?? "—"],
                          ["Effective at", fmt(terms.effective_at)],
                        ]
                      : [
                          ["Source", "External URLs"],
                          ["Terms version", terms.terms_version],
                          [
                            "Terms URL",
                            terms.terms_url ? (
                              <a
                                key="t"
                                href={terms.terms_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#2F6FE4] underline-offset-2 hover:underline break-all"
                              >
                                {terms.terms_url}
                              </a>
                            ) : (
                              "—"
                            ),
                          ],
                          ["Privacy version", terms.privacy_version],
                          [
                            "Privacy URL",
                            terms.privacy_url ? (
                              <a
                                key="p"
                                href={terms.privacy_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#2F6FE4] underline-offset-2 hover:underline break-all"
                              >
                                {terms.privacy_url}
                              </a>
                            ) : (
                              "—"
                            ),
                          ],
                          ["Effective at", fmt(terms.effective_at)],
                        ]
                  }
                />
              </>
            ) : (
              <div className="rounded-[12px] border border-[#FDBA74] bg-[#FFF7ED] px-4 py-3 text-sm leading-6 text-[#B45309]">
                <div className="font-semibold text-[#B45309]">Terms & privacy not configured</div>
                <p className="mt-1 text-sm leading-6 text-[#B45309]/90">
                  Visitor registration on the public join page is blocked until an active
                  terms version is set for this event.
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setTermsDialogOpen(true)}
                    className="mt-3 h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]"
                  >
                    Configure terms & privacy
                  </button>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-[#B45309]">
                    Ask an organisation admin or owner to configure terms.
                  </p>
                )}
              </div>
            )}
            {agencyId && (
              <EventTermsDialog
                open={termsDialogOpen}
                onOpenChange={setTermsDialogOpen}
                agencyId={agencyId}
                eventId={bundle.event.id}
                eventName={bundle.event.name}
                initialVersionLabel={terms?.terms_version ?? null}
                initialLegalSource={terms?.legal_source ?? null}
                initial={
                  terms
                    ? {
                        terms_title: terms.terms_title,
                        terms_body: terms.terms_body,
                        privacy_title: terms.privacy_title,
                        privacy_body: terms.privacy_body,
                        terms_url: terms.terms_url,
                        privacy_url: terms.privacy_url,
                      }
                    : null
                }
                onSaved={() => {
                  toast.success("Terms & privacy updated");
                  setReloadKey((k) => k + 1);
                }}
              />
            )}
          </Section>


          <Section title="Check-in settings" tab="checkin">
            {canEdit && isEditingCheckin && checkinForm ? (
              <div className="space-y-5">
                {(checkinValidationError || checkinSaveError) && (
                  <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                    {checkinValidationError ?? checkinSaveError}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <ToggleRow
                    title="One check-in per venue"
                    description="Each visitor counts once per venue, regardless of how many times they scan."
                    checked={checkinForm.one_checkin_per_venue}
                    onChange={(v) => setCheckinForm({ ...checkinForm, one_checkin_per_venue: v })}
                  />
                  <ToggleRow
                    title="Allow manual admin check-ins"
                    description="Lets admins record a check-in without the visitor scanning."
                    checked={checkinForm.allow_manual_admin_checkins}
                    onChange={(v) => setCheckinForm({ ...checkinForm, allow_manual_admin_checkins: v })}
                  />
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Minimum seconds between check-ins" required>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={checkinForm.minimum_seconds_between_checkins}
                      onChange={(e) => setCheckinForm({ ...checkinForm, minimum_seconds_between_checkins: e.target.value })}
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                    <p className="text-xs leading-5 text-[#64748B]">Throttles rapid re-scans at the same venue.</p>
                  </Field>
                  <Field label="Max check-ins per passport per day">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={checkinForm.max_checkins_per_passport_per_day}
                      onChange={(e) => setCheckinForm({ ...checkinForm, max_checkins_per_passport_per_day: e.target.value })}
                      placeholder="Leave blank for unlimited"
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                    <p className="text-xs leading-5 text-[#64748B]">Leave blank for unlimited.</p>
                  </Field>
                </div>
                {checkinSaveSuccess && (
                  <div className="rounded-[12px] border border-[#86EFAC] bg-[#ECFDF5] px-4 py-3 text-sm text-[#047857]">
                    Check-in settings saved.
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 border-t border-[#E6ECF4] pt-5">
                  <button
                    type="button"
                    onClick={cancelEditCheckin}
                    disabled={checkinSaving}
                    className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:opacity-50"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    onClick={saveEditCheckin}
                    disabled={checkinSaving}
                    className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checkinSaving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : checkin ? (
              <DefList
                rows={[
                  ["One per venue", checkin.one_checkin_per_venue ? "yes" : "no"],
                  ["Min seconds between", String(checkin.minimum_seconds_between_checkins)],
                  ["Allow manual admin", checkin.allow_manual_admin_checkins ? "yes" : "no"],
                  [
                    "Max per passport/day",
                    checkin.max_checkins_per_passport_per_day === null
                      ? "unlimited"
                      : String(checkin.max_checkins_per_passport_per_day),
                  ],
                ]}
              />
            ) : (
              <EmptyNotice>No check-in settings.</EmptyNotice>
            )}
          </Section>


          <Section title="Leaderboard" id="section-leaderboard" tab="leaderboard">
            <div className="mb-4 flex flex-wrap justify-end gap-2">
              <Link
                to="/admin/events/$eventId/leaderboard"
                params={{ eventId: bundle.event.id }}
                className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
              >
                Open leaderboard
              </Link>
            </div>
            {canEdit && isEditingLeaderboard && lbForm ? (
              <div className="space-y-5">
                {(lbValidationError || lbSaveError) && (
                  <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                    {lbValidationError ?? lbSaveError}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <ToggleRow
                    title="Public leaderboard enabled"
                    description="Visitors can see the public leaderboard for this event."
                    checked={lbForm.is_enabled}
                    onChange={(v) => setLbForm({ ...lbForm, is_enabled: v })}
                  />
                  <Field label="Display mode" required>
                    <select
                      value={lbForm.display_mode}
                      onChange={(e) =>
                        setLbForm({ ...lbForm, display_mode: e.target.value as LeaderboardDisplayMode })
                      }
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    >
                      <option value="first_name_last_initial">First name + last initial</option>
                      <option value="first_name_only">First name only</option>
                      <option value="alias_only">Alias only</option>
                      <option value="anonymous">Anonymous</option>
                    </select>
                  </Field>
                  <ToggleRow
                    title="Show first name"
                    checked={lbForm.show_first_name}
                    onChange={(v) => setLbForm({ ...lbForm, show_first_name: v })}
                  />
                  <ToggleRow
                    title="Show last initial"
                    checked={lbForm.show_last_initial}
                    onChange={(v) => setLbForm({ ...lbForm, show_last_initial: v })}
                  />
                  <ToggleRow
                    title="Show visit count"
                    checked={lbForm.show_visit_count}
                    onChange={(v) => setLbForm({ ...lbForm, show_visit_count: v })}
                  />
                  <Field label="Hide below check-ins" required>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={lbForm.hide_below_checkins}
                      onChange={(e) => setLbForm({ ...lbForm, hide_below_checkins: e.target.value })}
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                    <p className="text-xs leading-5 text-[#64748B]">
                      Visitors below this number of check-ins are hidden.
                    </p>
                  </Field>
                  <ToggleRow
                    title="Allow visitors to opt out"
                    description="Lets visitors hide themselves from the public leaderboard."
                    checked={lbForm.allow_visitor_opt_out}
                    onChange={(v) => setLbForm({ ...lbForm, allow_visitor_opt_out: v })}
                  />
                </div>
                <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#334155]">
                  Privacy: email, mobile, postcode, and full name are never displayed
                  publicly. Default display is first name + last initial.
                </div>
                {lbSaveSuccess && (
                  <div className="rounded-[12px] border border-[#86EFAC] bg-[#ECFDF5] px-4 py-3 text-sm text-[#047857]">
                    Leaderboard settings saved.
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 border-t border-[#E6ECF4] pt-5">
                  <button
                    type="button"
                    onClick={cancelEditLeaderboard}
                    disabled={lbSaving}
                    className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:opacity-50"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    onClick={saveEditLeaderboard}
                    disabled={lbSaving}
                    className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {lbSaving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : leaderboard ? (
              <>
                {!leaderboard.is_enabled && (
                  <div className="mb-3 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Public leaderboard is disabled for this event.
                  </div>
                )}
                <DefList
                  rows={[
                    ["Enabled", leaderboard.is_enabled ? "yes" : "no"],
                    ["Display mode", leaderboard.display_mode],
                    ["Show first name", leaderboard.show_first_name ? "yes" : "no"],
                    ["Show last initial", leaderboard.show_last_initial ? "yes" : "no"],
                    ["Show visit count", leaderboard.show_visit_count ? "yes" : "no"],
                    ["Hide below check-ins", String(leaderboard.hide_below_checkins)],
                    ["Allow visitor opt-out", leaderboard.allow_visitor_opt_out ? "yes" : "no"],
                  ]}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Privacy: email, mobile, postcode, and full name are never displayed publicly.
                  Default display is first name + last initial.
                </p>
              </>
            ) : (
              <EmptyNotice>
                No leaderboard settings. Public leaderboard is disabled by default.
              </EmptyNotice>
            )}
          </Section>


          <Section title="Reward tiers" id="section-rewards" tab="leaderboard">
            <AdminEventRewards
              agencyId={event.agency_id}
              eventId={event.id}
              canEdit={canEdit}
            />
          </Section>



          <Section
            id="section-venues"
            title="Venues for this event"
            description="Add and manage the venues/stops that visitors can collect stamps from for this event."
            tab="venues"
          >
            {canEdit && venueEditingId === null && (
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm leading-6 text-[#64748B]">
                    Manage the venues that visitors can check in at during this event.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCreateVenue}
                  className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]"
                >
                  Add venue
                </button>
              </div>
            )}
            {venueArchiveError && (
              <div className="mb-3 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                {venueArchiveError}
              </div>
            )}
            {venueEditingId !== null && venueForm && (
              <div ref={venueEditorRef} className="mb-5 space-y-5 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-[#111827]">
                    {venueEditingId === "new" ? "New venue" : "Edit venue details"}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelVenueEdit}
                      disabled={venueSaving}
                      className="h-10 rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Discard changes
                    </button>
                    <button
                      type="button"
                      onClick={saveVenue}
                      disabled={venueSaving}
                      className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {venueSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                {(venueValidationError || venueSaveError) && (
                  <div className="whitespace-pre-wrap rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                    {venueValidationError ?? venueSaveError}
                  </div>
                )}
                {venueSaveDebug && (
                  <div className="rounded-[12px] border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-xs text-[#334155]">
                    <div className="mb-2 font-semibold text-[#111827]">Venue save diagnostic</div>
                    <dl className="grid gap-1 sm:grid-cols-[150px_1fr]">
                      <dt className="font-medium">Route/action</dt>
                      <dd>{venueSaveDebug.route} / {venueSaveDebug.action}</dd>
                      <dt className="font-medium">Payload keys</dt>
                      <dd>{venueSaveDebug.payloadKeys.length ? venueSaveDebug.payloadKeys.join(", ") : "—"}</dd>
                      <dt className="font-medium">Venue ID</dt>
                      <dd className="break-all">{venueSaveDebug.venueId ?? "—"}</dd>
                      <dt className="font-medium">Event ID</dt>
                      <dd className="break-all">{venueSaveDebug.eventId}</dd>
                      <dt className="font-medium">Agency ID</dt>
                      <dd className="break-all">{venueSaveDebug.agencyId ?? "—"}</dd>
                      <dt className="font-medium">Supabase message</dt>
                      <dd className="whitespace-pre-wrap">{venueSaveDebug.message}</dd>
                      <dt className="font-medium">Details</dt>
                      <dd className="whitespace-pre-wrap">{venueSaveDebug.details ?? "—"}</dd>
                      <dt className="font-medium">Hint</dt>
                      <dd className="whitespace-pre-wrap">{venueSaveDebug.hint ?? "—"}</dd>
                      <dt className="font-medium">Code</dt>
                      <dd>{venueSaveDebug.code ?? "—"}</dd>
                      <dt className="font-medium">HTTP</dt>
                      <dd>{venueSaveDebug.httpStatus ? `${venueSaveDebug.httpStatus}${venueSaveDebug.httpStatusText ? ` ${venueSaveDebug.httpStatusText}` : ""}` : "—"}</dd>
                      <dt className="font-medium">Matched rows</dt>
                      <dd>{venueSaveDebug.matchedRows ?? "—"}</dd>
                    </dl>
                  </div>
                )}

                {venueEditingId === "new" ? (
                  <div className="space-y-4">
                    <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm leading-6 text-[#334155]">
                      <strong>Step 1 of 2.</strong> Name the venue and pin its location. You can add description, images, contact details, and QR after this step.
                    </div>
                    <Field label="Venue name" required>
                      <input
                        type="text"
                        maxLength={150}
                        autoFocus
                        value={venueForm.name}
                        onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                        placeholder="e.g. Riverbank Cellar Door"
                        className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                      />
                    </Field>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-foreground">Find location</div>
                      <VenueMapKitPicker
                        value={{
                          name: venueForm.name,
                          address: venueForm.address,
                          lat: venueForm.lat,
                          lng: venueForm.lng,
                        }}
                        nameIsBlank={venueForm.name.trim().length === 0}
                        onChange={(next) =>
                          setVenueForm((prev) => (prev ? { ...prev, ...next } : prev))
                        }
                        onClose={() => { /* keep picker mounted in step 1 */ }}
                      />
                    </div>
                    <Field label="Address">
                      <input
                        type="text"
                        maxLength={300}
                        value={venueForm.address}
                        onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })}
                        placeholder="Set automatically from the map, or enter manually"
                        className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Coordinates are saved from the map and shown later in the Location section.
                      </p>
                    </Field>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={saveVenue}
                        disabled={venueSaving || venueForm.name.trim().length === 0}
                        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {venueSaving ? "Creating…" : "Create venue & continue"}
                      </button>
                    </div>
                  </div>
                ) : (
                <>
                <FormSection title="Basics">
                  <Field label="Name" required>
                    <input
                      type="text"
                      maxLength={150}
                      value={venueForm.name}
                      onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Status" required>
                      <select
                        value={venueForm.status}
                        onChange={(e) =>
                          setVenueForm({
                            ...venueForm,
                            status: e.target.value === "inactive" ? "inactive" : "active",
                          })
                        }
                        className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </Field>
                    <Field label="Order" required>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={venueForm.order_index}
                        onChange={(e) => setVenueForm({ ...venueForm, order_index: e.target.value })}
                        className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                      />
                    </Field>
                  </div>
                </FormSection>

                <FormSection title="Public page content">
                  <Field label="Description">
                    <textarea
                      rows={5}
                      maxLength={1250}
                      value={venueForm.description}
                      onChange={(e) => setVenueForm({ ...venueForm, description: e.target.value })}
                      placeholder="What makes this venue worth visiting?"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {venueForm.description.length}/1200
                    </p>
                  </Field>
                  {bundle?.offerSupported ? (
                    <Field label="Offer summary">
                      <textarea
                        rows={4}
                        maxLength={850}
                        value={venueForm.offer_summary}
                        onChange={(e) => setVenueForm({ ...venueForm, offer_summary: e.target.value })}
                        placeholder="e.g. Complimentary tasting flight on arrival, plus a bonus stamp for trail visitors."
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Shown on the venue page and the public Offers page. Tasting offer, discount, bonus stamp, etc. {venueForm.offer_summary.length}/800
                      </p>
                    </Field>
                  ) : (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      Offer summary field not available — the <span className="font-mono">venues.offer_summary</span> column is not deployed in this environment.
                    </p>
                  )}
                </FormSection>

                {venueEditingId !== "new" && (() => {
                  const activeSub =
                    domains.find(
                      (d) =>
                        d.domain_type === "event_subdomain" &&
                        d.status === "active" &&
                        d.is_primary &&
                        !!d.public_subdomain,
                    ) ??
                    domains.find(
                      (d) =>
                        d.domain_type === "event_subdomain" &&
                        d.status === "active" &&
                        !!d.public_subdomain,
                    ) ??
                    null;
                  const publicVenueUrl = activeSub?.public_subdomain
                    ? tenantUrl(activeSub.public_subdomain, `/venues/${venueEditingId}`)
                    : null;
                  return (
                    <FormSection title="Public links">
                      {publicVenueUrl ? (
                        <div className="space-y-2">
                          <div className="rounded-md border bg-background/60 px-3 py-2 text-xs font-mono break-all">
                            {publicVenueUrl}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(publicVenueUrl);
                                  toast.success("Public venue URL copied.");
                                } catch {
                                  toast.error("Could not copy to clipboard.");
                                }
                              }}
                              className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
                            >
                              Copy public URL
                            </button>
                            <a
                              href={publicVenueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
                            >
                              Open ↗
                            </a>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Only visible publicly when the venue status is <span className="font-mono">active</span>.
                          </p>
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                          Add an active public subdomain for this event to get a shareable venue URL.
                        </p>
                      )}
                    </FormSection>
                  );
                })()}

                <FormSection title="Images">
                  {venueEditingId === "new" ? (
                    <p className="rounded-md border border-dashed bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                      Save the venue first — the editor will stay open and image upload will become available immediately.
                    </p>
                  ) : (
                    <>
                      <VenueImageField
                        kind="logo"
                        label="Logo"
                        helpText={`Square works best. PNG / JPG / WebP, up to ${Math.round(VENUE_ASSET_MAX_BYTES.logo / (1024 * 1024))} MB.`}
                        path={venueForm.logo_path}
                        canEdit={canEdit}
                        busy={venueAssetBusy === "logo"}
                        onUpload={(f) => uploadVenueImage("logo", f)}
                        onRemove={() => removeVenueImage("logo")}
                      />
                      <VenueImageField
                        kind="cover"
                        label="Hero / cover image"
                        helpText={`Wide hero image. PNG / JPG / WebP, up to ${Math.round(VENUE_ASSET_MAX_BYTES.cover / (1024 * 1024))} MB.`}
                        path={venueForm.cover_path}
                        canEdit={canEdit}
                        busy={venueAssetBusy === "cover"}
                        onUpload={(f) => uploadVenueImage("cover", f)}
                        onRemove={() => removeVenueImage("cover")}
                      />
                      {venueAssetError && (
                        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                          {venueAssetError}
                        </p>
                      )}
                    </>
                  )}
                </FormSection>

                <FormSection title="Contact">
                  <Field label="Website">
                    <input
                      type="url"
                      inputMode="url"
                      value={venueForm.website_url}
                      onChange={(e) => setVenueForm({ ...venueForm, website_url: e.target.value })}
                      placeholder="https://example.com"
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Must start with https://</p>
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      inputMode="tel"
                      maxLength={40}
                      value={venueForm.phone}
                      onChange={(e) => setVenueForm({ ...venueForm, phone: e.target.value })}
                      placeholder="+61 400 000 000"
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                  </Field>
                </FormSection>

                <FormSection title="Location">
                  <Field label="Address">
                    <input
                      type="text"
                      maxLength={300}
                      value={venueForm.address}
                      onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })}
                      placeholder="e.g. 123 Main St, Sydney NSW 2000"
                      className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude">
                      <input
                        type="number"
                        step="any"
                        min={-90}
                        max={90}
                        value={venueForm.lat}
                        onChange={(e) => setVenueForm({ ...venueForm, lat: e.target.value })}
                        className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                      />
                    </Field>
                    <Field label="Longitude">
                      <input
                        type="number"
                        step="any"
                        min={-180}
                        max={180}
                        value={venueForm.lng}
                        onChange={(e) => setVenueForm({ ...venueForm, lng: e.target.value })}
                        className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                      />
                    </Field>
                  </div>
                  <div className="space-y-2">
                    {!mapPickerOpen && (
                      <button
                        type="button"
                        onClick={() => setMapPickerOpen(true)}
                        className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        Select location with Apple Maps
                      </button>
                    )}
                    {mapPickerOpen && (
                      <VenueMapKitPicker
                        value={{
                          name: venueForm.name,
                          address: venueForm.address,
                          lat: venueForm.lat,
                          lng: venueForm.lng,
                        }}
                        nameIsBlank={venueForm.name.trim().length === 0}
                        onChange={(next) =>
                          setVenueForm((prev) => (prev ? { ...prev, ...next } : prev))
                        }
                        onClose={() => setMapPickerOpen(false)}
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Map selection sets the public venue location. Manual address and coordinates still work if the map is unavailable.
                    </p>
                  </div>
                  {(() => {
                    const lat = venueForm.lat.trim() ? Number(venueForm.lat.trim()) : null;
                    const lng = venueForm.lng.trim() ? Number(venueForm.lng.trim()) : null;
                    const directionsUrl = buildAppleMapsDirectionsUrl({
                      name: venueForm.name || "Venue",
                      address: venueForm.address || null,
                      lat: lat !== null && Number.isFinite(lat) ? lat : null,
                      lng: lng !== null && Number.isFinite(lng) ? lng : null,
                    });
                    return directionsUrl ? (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        Preview “Get directions” (Apple Maps) ↗
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Add an address or coordinates to enable the “Get directions” link on the public venue page.
                      </p>
                    );
                  })()}
                </FormSection>
                </>
                )}
              </div>
            )}
            {(() => {
              const activeVenues = venues.filter((v) => v.deleted_at == null);
              const disabledVenues = venues.filter((v) => v.deleted_at != null);
              const visibleVenues =
                venueFilter === "active"
                  ? activeVenues
                  : venueFilter === "disabled"
                    ? disabledVenues
                    : venues;
              return (
                <>
                  <div className="mb-3 inline-flex items-center gap-1 rounded-[10px] border border-[#D9E2EF] bg-white p-1 text-xs">
                    {(["active", "disabled", "all"] as VenueFilter[]).map((opt) => {
                      const count =
                        opt === "active"
                          ? activeVenues.length
                          : opt === "disabled"
                            ? disabledVenues.length
                            : venues.length;
                      const selected = venueFilter === opt;
                      const label =
                        opt === "active"
                          ? "Active"
                          : opt === "disabled"
                            ? "Disabled / Archived"
                            : "All";
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setVenueFilter(opt)}
                          className={
                            "rounded-[8px] px-3 py-1.5 font-semibold capitalize " +
                            (selected
                              ? "bg-[#2F6FE4] text-white"
                              : "text-[#475569] hover:bg-[#F1F5F9]")
                          }
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                  </div>
                  {venueFilter === "disabled" && (
                    <p className="mb-3 text-sm text-[#64748B]">
                      Disabled venues do not count toward your venue limit. You can reactivate them, or permanently delete them if they have no linked history.
                    </p>
                  )}
            {venues.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
                No venues have been added yet. Add the first venue so visitors have somewhere to check in during this event.
                {canEdit && (
                  <div>
                    <button
                      type="button"
                      onClick={startCreateVenue}
                      className="mt-4 h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]"
                    >
                      Add first venue
                    </button>
                  </div>
                )}
              </div>
            ) : visibleVenues.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-8 text-center text-sm text-[#475569]">
                {venueFilter === "disabled"
                  ? "No disabled venues yet. Disabled venues will appear here and will not count toward your venue limit."
                  : venueFilter === "active"
                    ? "No active venues."
                    : "No venues."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] border border-[#E6ECF4] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.035)]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wider text-[#64748B]">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Address</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Active QR</th>
                      <th className="px-3 py-2 font-medium">Issued</th>
                      {canEdit && <th className="px-3 py-2 font-medium">QR link</th>}
                      {canEdit && <th className="px-3 py-2 font-medium">QR controls</th>}
                      {canEdit && <th className="px-3 py-2 font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleVenues.map((v) => {
                      const qr = qrByVenue.get(v.id);
                      const hasActiveQr = !!qr;
                      const isBusy = qrActionVenueId === v.id;
                      const token = qr?.token ?? null;
                      const built = token ? buildCheckinUrl(token) : null;
                      return (
                        <tr
                          key={v.id}
                          onClick={() => {
                            if (canEdit && venueEditingId === null && venueArchivingId === null && v.deleted_at == null) {
                              startEditVenue(v);
                            }
                          }}
                          className={
                            "border-t border-[#E6ECF4] align-top " +
                            (v.deleted_at != null ? "bg-[#F8FAFC]/60 " : "") +
                            (canEdit && venueEditingId === null && venueArchivingId === null && v.deleted_at == null
                              ? "cursor-pointer transition-colors hover:bg-[#F8FAFC]"
                              : "")
                          }
                          title={canEdit && venueEditingId === null && v.deleted_at == null ? "Open venue details" : undefined}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{v.order_index}</td>
                          <td className="px-3 py-2 font-medium">
                            {canEdit && v.deleted_at == null ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (venueEditingId === null && venueArchivingId === null) {
                                    startEditVenue(v);
                                  }
                                }}
                                disabled={venueEditingId !== null || venueArchivingId !== null}
                                className="text-left font-medium text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline"
                              >
                                {v.name}
                              </button>
                            ) : (
                              <span className={v.deleted_at != null ? "text-[#64748B]" : undefined}>{v.name}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{v.address ?? "—"}</td>
                          <td className="px-3 py-2">
                            {v.deleted_at != null ? (
                              <span className="inline-flex items-center rounded-full border border-[#CBD5E1] bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#475569]">
                                Disabled
                              </span>
                            ) : (
                              <span className={
                                v.status === "active"
                                  ? "inline-flex items-center rounded-full border border-[#86EFAC] bg-[#ECFDF5] px-3 py-1 text-xs font-semibold text-[#047857]"
                                  : "inline-flex items-center rounded-full border border-[#CBD5E1] bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#475569]"
                              }>{v.status}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {hasActiveQr ? (
                              <span className="inline-flex items-center rounded-full border border-[#86EFAC] bg-[#ECFDF5] px-3 py-1 text-xs font-semibold text-[#047857]">
                                {qr!.status}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-[#FDBA74] bg-[#FFF7ED] px-3 py-1 text-xs font-semibold text-[#B45309]">none</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmt(qr?.issued_at)}</td>
                          {canEdit && (
                            <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                              {!hasActiveQr ? (
                                <span className="text-xs text-muted-foreground/70">No QR yet</span>
                              ) : !built ? (
                                <span className="text-xs text-muted-foreground/70">—</span>
                              ) : built.isFallback ? (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                    Public address required before QR link can be shown.
                                  </p>
                                  <Link
                                    to="/admin/events/$eventId"
                                    params={{ eventId: event.id }}
                                    hash="section-public-address"
                                    className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-[11px] font-medium hover:bg-muted"
                                  >
                                    Set public address
                                  </Link>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  <a
                                    href={built.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-[11px] break-all text-primary underline-offset-2 hover:underline"
                                    title={built.url}
                                  >
                                    {built.url.replace(/^https?:\/\//, "")}
                                  </a>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => copyQrLink(v.id)}
                                      disabled={isBusy}
                                      className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {qrCopiedVenueId === v.id ? "Copied" : "Copy link"}
                                    </button>
                                    <a
                                      href={built.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
                                    >
                                      Open
                                    </a>
                                  </div>
                                </div>
                              )}
                            </td>
                          )}
                          {canEdit && (
                            <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                              {hasActiveQr ? (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => generateOrRotateQr(v.id, true)}
                                      disabled={isBusy}
                                      className="inline-flex h-9 items-center rounded-[10px] border border-[#FDBA74] bg-white px-3.5 text-sm font-semibold text-[#B45309] hover:bg-[#FFF7ED] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isBusy ? "Working…" : "Rotate QR"}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2">
                                    <label
                                      htmlFor={`entry-value-${v.id}`}
                                      className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                                    >
                                      Stamp value
                                    </label>
                                    <input
                                      id={`entry-value-${v.id}`}
                                      type="number"
                                      min={1}
                                      max={100}
                                      step={1}
                                      inputMode="numeric"
                                      value={
                                        qrEntryDraft.get(v.id) ??
                                        String(qr!.entry_value ?? 1)
                                      }
                                      onChange={(e) => {
                                        const val = e.currentTarget.value;
                                        setQrEntryDraft((m) => {
                                          const next = new Map(m);
                                          next.set(v.id, val);
                                          return next;
                                        });
                                      }}
                                      className="h-10 w-20 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                                    />
                                    {(() => {
                                      const draft = qrEntryDraft.get(v.id);
                                      const dirty =
                                        draft !== undefined &&
                                        draft !== String(qr!.entry_value ?? 1);
                                      const saving = qrEntrySavingId === v.id;
                                      if (!dirty && !saving) return null;
                                      return (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            saveQrEntryValue(v.id, draft ?? "1")
                                          }
                                          disabled={saving}
                                          className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {saving ? "Saving…" : "Save"}
                                        </button>
                                      );
                                    })()}
                                    <span className="basis-full text-[10px] leading-tight text-muted-foreground">
                                      Changes apply to future scans only. Existing check-ins keep the value earned at scan time.
                                    </span>
                                  </div>
                                  {built && (
                                    <QrPreview
                                      value={built.url}
                                      downloadName={qrFilename(event.public_slug ?? event.slug, v.name)}
                                      poster={{
                                        eventName: event.name,
                                        venueName: v.name,
                                        logoUrl: getEventAssetPublicUrl(branding?.logo_path),
                                        primaryColor: branding?.primary_color ?? null,
                                        accentColor: branding?.accent_color ?? null,
                                        offerSummary: offerSummaryByVenue.get(v.id) ?? null,
                                        entryValue: qr?.entry_value ?? null,
                                        filename: posterFilename(
                                          event.public_slug ?? event.slug,
                                          v.name,
                                        ),
                                      }}
                                    />
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => generateOrRotateQr(v.id, false)}
                                  disabled={isBusy}
                                  className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isBusy ? "Generating…" : "Generate QR"}
                                </button>
                              )}
                            </td>
                          )}
                          {canEdit && (
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); startEditVenue(v); }}
                                  disabled={
                                    venueEditingId !== null ||
                                    venueArchivingId !== null ||
                                    (v.deleted_at != null && !agency.isPlatformAdmin)
                                  }
                                  className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {v.deleted_at != null && agency.isPlatformAdmin ? "View / edit details" : "Edit details"}
                                </button>
                                {v.deleted_at == null ? (
                                  <button
                                    type="button"
                                    onClick={() => disableVenue(v.id)}
                                    disabled={venueEditingId !== null || venueArchivingId !== null}
                                    className="inline-flex h-9 items-center rounded-[10px] border border-[#FDA4AF] bg-white px-3.5 text-sm font-semibold text-[#E11D48] hover:bg-[#FFF1F2] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {venueArchivingId === v.id ? "Disabling…" : "Disable venue"}
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => reactivateVenue(v.id)}
                                      disabled={venueEditingId !== null || venueArchivingId !== null}
                                      className="inline-flex h-9 items-center rounded-[10px] border border-[#86EFAC] bg-white px-3.5 text-sm font-semibold text-[#047857] hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {venueArchivingId === v.id ? "Working…" : "Reactivate venue"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => hardDeleteVenue(v.id)}
                                      disabled={venueEditingId !== null || venueArchivingId !== null}
                                      className="inline-flex h-9 items-center rounded-[10px] border border-[#E11D48] bg-[#E11D48] px-3.5 text-sm font-semibold text-white hover:bg-[#BE123C] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {venueArchivingId === v.id ? "Deleting…" : "Delete permanently"}
                                    </button>
                                    {agency.isPlatformAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setForceDeleteVenueId(v.id);
                                          setForceDeleteConfirm("");
                                          setForceDeleteError(null);
                                        }}
                                        disabled={venueEditingId !== null || venueArchivingId !== null}
                                        title="Platform admin only: permanently delete this venue and all linked history"
                                        className="inline-flex h-9 items-center rounded-[10px] border border-[#7F1D1D] bg-[#7F1D1D] px-3.5 text-sm font-semibold text-white hover:bg-[#5B0F0F] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Force delete venue and history
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {qrActionError && canEdit && (
                  <div className="border-t bg-destructive/5 px-3 py-2 text-xs text-destructive space-y-1">
                    <p>{qrActionError}</p>
                    {qrSupportDetails && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={copyQrSupportDetails}
                          className="inline-flex h-6 items-center rounded-md border border-destructive/40 bg-background px-2 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                        >
                          {qrSupportCopied ? "Copied" : "Copy support details"}
                        </button>
                        <details className="text-[11px] text-destructive/80">
                          <summary className="cursor-pointer">Show details</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-destructive/5 p-2 text-[10px] leading-snug text-destructive">
{qrSupportDetails}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                )}
                <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {canEdit
                    ? "Rotating a QR invalidates the previous code immediately. Visitor redemption and poster downloads are not wired yet."
                    : "QR controls are restricted to organisation owners and admins."}
                </p>
              </div>
            )}
                </>
              );
            })()}
          </Section>

          <Section title="Analytics" id="section-analytics" tab="analytics">
            <p className="mb-3 text-sm text-muted-foreground">
              Event analytics live on a dedicated dashboard. Open it to view
              visitor counts, check-ins, top venues and CSV exports.
            </p>
            <Link
              to="/admin/analytics"
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Open analytics dashboard
            </Link>
          </Section>
        </div>
      </EventTabContext.Provider>
      {forceDeleteVenueId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!forceDeleteBusy) {
              setForceDeleteVenueId(null);
              setForceDeleteConfirm("");
              setForceDeleteError(null);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-[14px] border border-[#7F1D1D]/40 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#7F1D1D]">
              Force delete venue and history?
            </h2>
            <p className="mt-2 text-sm text-[#475569]">
              This will permanently delete this venue and its linked check-ins,
              QR codes, offers, and venue history. This is intended only for
              platform-admin testing or cleanup and cannot be undone.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Type <span className="font-mono text-[#7F1D1D]">DELETE VENUE AND HISTORY</span> to confirm
            </label>
            <input
              type="text"
              autoFocus
              value={forceDeleteConfirm}
              onChange={(e) => {
                setForceDeleteConfirm(e.target.value);
                setForceDeleteError(null);
              }}
              disabled={forceDeleteBusy}
              className="mt-2 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 py-2 font-mono text-sm text-[#111827] focus:border-[#7F1D1D] focus:outline-none"
            />
            {forceDeleteError && (
              <p className="mt-3 rounded-md bg-[#FEF2F2] px-3 py-2 text-xs text-[#7F1D1D]">
                {forceDeleteError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setForceDeleteVenueId(null);
                  setForceDeleteConfirm("");
                  setForceDeleteError(null);
                }}
                disabled={forceDeleteBusy}
                className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runForceDeleteVenue}
                disabled={
                  forceDeleteBusy ||
                  forceDeleteConfirm !== "DELETE VENUE AND HISTORY"
                }
                className="inline-flex h-9 items-center rounded-[10px] border border-[#7F1D1D] bg-[#7F1D1D] px-3.5 text-sm font-semibold text-white hover:bg-[#5B0F0F] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {forceDeleteBusy ? "Deleting…" : "Force delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  description,
  children,
  id,
  tab,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
  tab?: EventTabKey;
}) {
  const active = useContext(EventTabContext);
  const isHidden = tab !== undefined && tab !== active;
  return (
    <section
      id={id}
      hidden={isHidden}
      className="scroll-mt-24 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
    >
      <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm leading-6 text-[#64748B]">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function DefList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[180px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">{k}</dt>
          <dd className="break-words text-sm font-medium text-[#111827]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ColorSwatch({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-4 w-4 rounded border"
        style={{ backgroundColor: value }}
        aria-hidden
      />
      <code className="text-xs">{value}</code>
    </span>
  );
}

function BrandingSummary({ branding }: { branding: Branding }) {
  const paletteKey = branding.palette_key ?? null;
  const isCustomPalette = paletteKey === "custom" || (!paletteKey && (branding.primary_color || branding.accent_color));
  const palette = resolveEventPalette({
    palette_key: paletteKey,
    primary_color: branding.primary_color,
    accent_color: branding.accent_color,
  });
  const bg = getBackground(branding.page_background_key ?? null);
  const isCustomBg = branding.page_background_key === "custom_color";
  const activeCardBg =
    isCustomBg && branding.card_background_color
      ? branding.card_background_color
      : palette.cardBg;
  const activePageBg =
    isCustomBg && branding.page_background_color
      ? branding.page_background_color
      : palette.pageBg;
  const swatches: Array<{ label: string; value: string }> = [
    { label: "Primary", value: palette.primary },
    { label: "Accent", value: palette.accent },
    { label: "Page bg", value: activePageBg },
    { label: "Card bg", value: activeCardBg },
  ];

  const rows: Array<[string, React.ReactNode]> = [];
  rows.push([
    "Colour palette",
    isCustomPalette ? (
      <span>Custom</span>
    ) : (
      <span>{palette.label}</span>
    ),
  ]);
  rows.push([
    "Palette preview",
    <span key="sw" className="inline-flex flex-wrap items-center gap-3">
      {swatches.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-4 rounded border"
            style={{ backgroundColor: s.value }}
            aria-hidden
          />
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </span>
      ))}
    </span>,
  ]);
  if (isCustomPalette) {
    rows.push(["Primary colour", <ColorSwatch key="p" value={branding.primary_color} />]);
    rows.push(["Accent colour", <ColorSwatch key="a" value={branding.accent_color} />]);
  } else if (paletteKey) {
    rows.push([
      "Source colours",
      <span className="text-xs text-muted-foreground">
        Primary &amp; accent are generated from the selected palette.
      </span>,
    ]);
  }
  rows.push([
    "Page background",
    branding.page_background_key === "custom_color" && branding.page_background_color
      ? (
        <span className="inline-flex items-center gap-2">
          <span>Custom colour</span>
          <ColorSwatch value={branding.page_background_color} />
        </span>
      )
      : bg
        ? <span>{bg.label}</span>
        : <span className="text-muted-foreground">Default</span>,
  ]);
  if (isCustomBg && branding.card_background_color) {
    rows.push(["Card background", <ColorSwatch key="cbg" value={branding.card_background_color} />]);
  }
  rows.push(["Logo", branding.logo_path ? "Uploaded" : "—"]);
  rows.push(["Cover image", branding.cover_path ? "Uploaded" : "—"]);

  return <DefList rows={rows} />;
}

function EmptyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm leading-6 text-[#475569]">
      {children}
    </div>
  );
}

function LoadDiagnosticPanel({
  diagnostic,
  eventId,
  agencyId,
  userId,
  email,
}: {
  diagnostic: LoadDiagnostic | null;
  eventId: string;
  agencyId: string | null;
  userId: string | null;
  email?: string | null;
}) {
  const rows = {
    step: diagnostic?.step ?? "unknown",
    result: diagnostic?.message ?? "No additional diagnostic captured.",
    code: diagnostic?.code ?? null,
    details: diagnostic?.details ?? null,
    hint: diagnostic?.hint ?? null,
    attempted_event_id: eventId,
    current_agency_id: agencyId,
    current_user_id: userId,
  };
  const getReport = () =>
    formatDiagnosticReport("Event load diagnostic", rows, { adminEmail: email });

  return (
    <details className="mt-4 rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground" open>
      <summary className="flex cursor-pointer items-center justify-between font-medium text-foreground">
        <span>Diagnostics (platform_admin)</span>
        <span onClick={(e) => e.preventDefault()}>
          <DiagnosticCopyButton getReport={getReport} />
        </span>
      </summary>
      <dl className="mt-3 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 font-mono">
        <dt>Attempted event id</dt>
        <dd className="break-all">{eventId}</dd>
        <dt>Current agency id</dt>
        <dd className="break-all">{agencyId ?? "(none selected)"}</dd>
        <dt>Current user id</dt>
        <dd className="break-all">{userId ?? "(not signed in)"}</dd>
        <dt>Failing step</dt>
        <dd className="break-all">{rows.step}</dd>
        <dt>Result</dt>
        <dd className="break-all whitespace-pre-wrap">{rows.result}</dd>
        <dt>Code</dt>
        <dd className="break-all">{rows.code ?? "—"}</dd>
        <dt>Details</dt>
        <dd className="break-all whitespace-pre-wrap">{rows.details ?? "—"}</dd>
        <dt>Hint</dt>
        <dd className="break-all">{rows.hint ?? "—"}</dd>
      </dl>
    </details>
  );
}


type ResolveEventByHostRow = {
  kind: string;
  event_id: string | null;
  public_slug: string | null;
  requires_auth: boolean;
};

function PublishGateDiagnostic({
  event,
  domains,
  activation,
  terms,
  checkin,
  venues,
}: {
  event: EventRow;
  domains: Domain[];
  activation: Activation | null;
  terms: TermsVersion | null;
  checkin: CheckinSettings | null;
  venues: Venue[];
}) {
  const [isPublishable, setIsPublishable] = useState<boolean | null>(null);
  const [publishableError, setPublishableError] = useState<string | null>(null);
  const [resolveRow, setResolveRow] = useState<ResolveEventByHostRow | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const primarySub =
    domains.find(
      (d) => d.domain_type === "event_subdomain" && d.is_primary && d.status === "active",
    )?.public_subdomain ??
    domains.find((d) => d.domain_type === "event_subdomain")?.public_subdomain ??
    null;
  const primaryCustom =
    domains.find(
      (d) => d.domain_type === "event_custom" && d.is_primary && d.status === "active",
    )?.custom_domain ?? null;
  const publicHostDisplay = primaryCustom
    ? primaryCustom
    : primarySub
      ? tenantHost(primarySub)
      : null;
  const publicUrl = primaryCustom
    ? `https://${primaryCustom}/`
    : primarySub
      ? tenantUrl(primarySub, "/")
      : null;
  const rpcHost = primaryCustom
    ? primaryCustom
    : primarySub
      ? tenantHost(primarySub)
      : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPublishableError(null);
      setResolveError(null);

      try {
        const r = await supabase.rpc("event_is_publishable", { _event_id: event.id });
        if (!cancelled) {
          if (r.error) setPublishableError(r.error.message);
          else setIsPublishable(Boolean(r.data));
        }
      } catch (e) {
        if (!cancelled) setPublishableError(e instanceof Error ? e.message : String(e));
      }

      if (rpcHost) {
        try {
          const r = await supabase.rpc("resolve_event_by_host", { _hostname: rpcHost });
          if (!cancelled) {
            if (r.error) setResolveError(r.error.message);
            else setResolveRow((r.data?.[0] ?? null) as ResolveEventByHostRow | null);
          }
        } catch (e) {
          if (!cancelled) setResolveError(e instanceof Error ? e.message : String(e));
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id, rpcHost]);

  const now = new Date();
  const startsAt = event.starts_at ? new Date(event.starts_at) : null;
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const dateWindowValid =
    (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
  const dateWindowLabel = !startsAt && !endsAt
    ? "open (no window set)"
    : `${fmt(event.starts_at)} → ${fmt(event.ends_at)} ${dateWindowValid ? "✓ in window" : "✗ outside window"}`;

  const Check = ({ ok, label, detail }: { ok: boolean | null; label: string; detail?: React.ReactNode }) => (
    <div className="flex items-start gap-2 py-1">
      <span
        className={
          ok === null
            ? "mt-0.5 inline-block h-3 w-3 rounded-full bg-muted-foreground/40"
            : ok
              ? "mt-0.5 inline-block h-3 w-3 rounded-full bg-emerald-500"
              : "mt-0.5 inline-block h-3 w-3 rounded-full bg-destructive"
        }
        aria-hidden
      />
      <div className="flex-1 text-xs">
        <div className="font-medium text-foreground">{label}</div>
        {detail !== undefined && <div className="text-muted-foreground">{detail}</div>}
      </div>
    </div>
  );

  const getReport = () =>
    formatDiagnosticReport(
      "Publish gate diagnostic",
      {
        event_id: event.id,
        agency_id: event.agency_id,
        event_status: event.status,
        public_slug: event.public_slug,
        public_url: publicUrl,
        public_host: publicHostDisplay,
        rpc_host_sent: rpcHost,
        rpc_host_note:
          "RPC _hostname matches the customer-facing host on " + PUBLIC_TENANT_ROOT_DOMAIN,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        date_window_valid: dateWindowValid,
        terms_version_id: event.current_terms_version_id,
        terms_version: terms?.terms_version ?? null,
        terms_legal_source: terms?.legal_source ?? null,
        checkin_settings_present: Boolean(checkin),
        checkin_one_per_venue: checkin?.one_checkin_per_venue ?? null,
        checkin_min_gap_seconds: checkin?.minimum_seconds_between_checkins ?? null,
        venue_count: venues.length,
        domains: domains.map((d) => ({
          id: d.id,
          domain_type: d.domain_type,
          public_subdomain: d.public_subdomain,
          custom_domain: d.custom_domain,
          is_primary: d.is_primary,
          status: d.status,
        })),
        activation: activation
          ? { activation_kind: activation.activation_kind, status: activation.status }
          : null,
        event_is_publishable_rpc: isPublishable,
        event_is_publishable_error: publishableError,
        resolve_event_by_host_rpc: resolveRow,
        resolve_event_by_host_error: resolveError,
      },
    );

  return (
    <section className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Publish gate diagnostic (platform_admin)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Live view of every condition the public <code>resolve_event_by_host</code> gate
            evaluates. Shown only to platform admins with the diagnostics toggle on. Uses the
            legacy RPC host (<code>{rpcHost ?? "—"}</code>) while the DB suffix migration is
            pending; the customer-facing URL below uses{" "}
            <code>{PUBLIC_TENANT_ROOT_DOMAIN}</code>.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DiagnosticCopyButton getReport={getReport} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            read-only · live RPC
          </span>
        </div>
      </div>


      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Event row
          </h4>
          <Check
            ok={event.status === "published"}
            label="status = published"
            detail={<code>{event.status}</code>}
          />
          <Check
            ok={true}
            label="deleted_at"
            detail={<code>null (loader filters soft-deleted)</code>}
          />
          <Check
            ok={Boolean(event.public_slug)}
            label="public_slug set"
            detail={<code>{event.public_slug ?? "—"}</code>}
          />
          <Check
            ok={dateWindowValid}
            label="date window valid"
            detail={dateWindowLabel}
          />
          <Check
            ok={Boolean(event.current_terms_version_id)}
            label="terms configured"
            detail={
              terms
                ? <code>v{terms.terms_version} ({terms.legal_source ?? "—"})</code>
                : <code>no current_terms_version_id</code>
            }
          />
          <Check
            ok={Boolean(checkin)}
            label="check-in settings row exists"
            detail={
              checkin
                ? `one-per-venue=${checkin.one_checkin_per_venue}, min-gap=${checkin.minimum_seconds_between_checkins}s`
                : "missing"
            }
          />
          <Check
            ok={venues.length > 0}
            label="at least one venue"
            detail={`${venues.length} venue(s)`}
          />
        </div>

        <div className="rounded-lg border bg-background p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Domain + activation
          </h4>
          {domains.length === 0 ? (
            <Check ok={false} label="event_domains" detail="no rows" />
          ) : (
            domains.map((d) => (
              <Check
                key={d.id}
                ok={d.is_primary && d.status === "active"}
                label={`event_domains[${d.domain_type}]`}
                detail={
                  <code className="break-all">
                    {d.public_subdomain ?? d.custom_domain ?? "—"} · is_primary={String(d.is_primary)} · status={d.status}
                  </code>
                }
              />
            ))
          )}
          <Check
            ok={Boolean(activation && (activation.status === "active" || activation.status === "comp"))}
            label="event_activations status"
            detail={
              activation
                ? <code>{activation.activation_kind} · {activation.status}</code>
                : <code>no activation row</code>
            }
          />
          <Check
            ok={isPublishable}
            label="event_is_publishable(event_id)"
            detail={
              loading
                ? "checking…"
                : publishableError
                  ? <span className="text-destructive">RPC error: {publishableError}</span>
                  : <code>{String(isPublishable)}</code>
            }
          />
        </div>

        <div className="rounded-lg border bg-background p-4 lg:col-span-2">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            resolve_event_by_host (live RPC)
          </h4>
          <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Public URL</dt>
            <dd>
              {publicUrl ? (
                <a href={publicUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline break-all">
                  {publicUrl}
                </a>
              ) : (
                <span className="text-muted-foreground">— (no primary subdomain/custom domain)</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Public host</dt>
            <dd className="break-all"><code>{publicHostDisplay ?? "—"}</code></dd>
            <dt className="text-muted-foreground">RPC host sent</dt>
            <dd className="break-all"><code>{rpcHost ?? "—"}</code></dd>
            <dt className="text-muted-foreground">kind</dt>
            <dd>
              {loading ? "…" : resolveError ? (
                <span className="text-destructive">RPC error: {resolveError}</span>
              ) : (
                <code className={resolveRow?.kind === "event" ? "" : "text-destructive"}>
                  {resolveRow?.kind ?? "(no row)"}
                </code>
              )}
            </dd>
            <dt className="text-muted-foreground">event_id</dt>
            <dd className="break-all"><code>{resolveRow?.event_id ?? "—"}</code></dd>
            <dt className="text-muted-foreground">public_slug</dt>
            <dd className="break-all"><code>{resolveRow?.public_slug ?? "—"}</code></dd>
          </dl>
          {!loading && resolveRow && resolveRow.kind !== "event" && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Public gate is rejecting this event. Most common causes: (a) no <code>event_domains</code> row
              with <code>is_primary=true</code> + <code>status=active</code>; (b) no active{" "}
              <code>event_activations</code>; (c) <code>events.status</code> not <code>published</code>;
              (d) DB <code>resolve_event_by_host</code> does not recognise the{" "}
              <code>.{PUBLIC_TENANT_ROOT_DOMAIN}</code> suffix yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-[#334155]">
        {label}
        {required ? <span className="ml-1 text-[#E11D48]">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-center justify-between gap-4 rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] px-4 py-3 " +
        (disabled ? "opacity-60" : "cursor-pointer hover:bg-white")
      }
    >
      <span className="space-y-1">
        <span className="block text-sm font-medium text-[#111827]">{title}</span>
        {description && (
          <span className="block text-xs leading-5 text-[#64748B]">{description}</span>
        )}
      </span>
      <span
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          if (disabled) return;
          e.preventDefault();
          onChange(!checked);
        }}
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
          (checked ? "bg-[#2F6FE4]" : "bg-[#CBD5E1]")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform " +
            (checked ? "translate-x-[22px]" : "translate-x-0.5")
          }
        />
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
    </label>
  );
}


function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h5 className="border-b pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h5>
      {children}
    </div>
  );
}

function VenueImageField({
  kind,
  label,
  helpText,
  path,
  canEdit,
  busy,
  onUpload,
  onRemove,
}: {
  kind: VenueAssetKind;
  label: string;
  helpText: string;
  path: string | null;
  canEdit: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const previewUrl = getVenueAssetPublicUrl(path);
  const isCover = kind === "cover";
  const inputId = `venue-asset-${kind}`;
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="rounded-md border bg-background/50 p-3">
        {previewUrl ? (
          <div
            className={
              isCover
                ? "mb-3 aspect-[3/1] w-full overflow-hidden rounded bg-muted/30"
                : "mb-3 h-24 w-24 overflow-hidden rounded bg-muted/30"
            }
          >
            <img src={previewUrl} alt={`${label} preview`} className="h-full w-full object-cover" />
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">No image uploaded.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            type="file"
            accept={VENUE_ASSET_ALLOWED_MIME.join(",")}
            disabled={!canEdit || busy}
            className="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) onUpload(f);
            }}
          />
          <label
            htmlFor={inputId}
            className={`inline-flex h-8 cursor-pointer items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted ${
              !canEdit || busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {busy ? "Uploading…" : previewUrl ? "Replace" : "Upload"}
          </label>
          {previewUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={!canEdit || busy}
              className="inline-flex h-8 items-center rounded-md border border-destructive/40 bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{helpText}</p>
      </div>
    </div>
  );
}


function EventSetupWarnings({
  status,
  domains,
  hasTerms,
  hasVenues,
  eventId,
}: {
  status: string;
  domains: Domain[];
  hasTerms: boolean;
  hasVenues: boolean;
  eventId: string;
}) {
  const activeSub = domains.find(
    (d) => d.domain_type === "event_subdomain" && d.status === "active",
  );
  const hasActiveSubdomain = Boolean(activeSub);
  const activePublicUrl = activeSub
    ? `https://${activeSub.public_subdomain}.getstampd.com.au/`
    : null;
  const hasPendingSubdomain = domains.some(
    (d) => d.domain_type === "event_subdomain" && d.status === "pending",
  );

  type Action =
    | { kind: "anchor"; href: string; label: string }
    | { kind: "external"; href: string; label: string }
    | { kind: "link"; to: string; params?: Record<string, string>; label: string };

  const items: {
    tone: "warn" | "info";
    title: string;
    body: string;
    action?: Action;
  }[] = [];

  if (status === "draft") {
    items.push({
      tone: "info",
      title: "Event is a draft",
      body: "Drafts are previewable inside admin only. Visitors can't reach this event yet.",
      action: { kind: "anchor", href: "#section-go-live", label: "Review go-live status" },
    });
  }

  if (hasActiveSubdomain) {
    items.push({
      tone: "info",
      title: "Public address active",
      body: "This event's subdomain is active.",
      action: activePublicUrl
        ? { kind: "external", href: activePublicUrl, label: "View public page" }
        : { kind: "anchor", href: "#section-public-address", label: "View address" },
    });
  } else {
    items.push({
      tone: "warn",
      title: hasPendingSubdomain
        ? "Public address reserved — billing activation required"
        : "Public address not claimed",
      body: hasPendingSubdomain
        ? "A subdomain has been reserved but is not active. It will go live once billing/activation is complete."
        : "Choose and reserve a subdomain so visitors can find this event after activation.",
      action: {
        kind: "anchor",
        href: "#section-public-address",
        label: hasPendingSubdomain ? "View activation status" : "Choose public address",
      },
    });
  }

  if (!hasTerms) {
    items.push({
      tone: "warn",
      title: "Terms & privacy not configured",
      body: "Add a terms version before publishing — visitors will need to accept it on first sign-up.",
      action: { kind: "anchor", href: "#section-terms", label: "Configure terms" },
    });
  }

  if (!hasVenues) {
    items.push({
      tone: "warn",
      title: "No venues added yet",
      body: "Visitors need at least one venue/stop to collect stamps.",
      action: { kind: "anchor", href: "#section-venues", label: "Add venues" },
    });
  }

  items.push({
    tone: "info",
    title: "Billing activation not configured",
    body: "Per-event billing/activation will be wired in a later step. This event won't go live publicly until it's activated.",
    action: { kind: "link", to: "/admin/account", label: "Go to Account & Billing" },
  });

  if (items.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {items.map((it, i) => (
        <div
          key={i}
          className={
            (it.tone === "warn"
              ? "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
              : "rounded-md border bg-muted/40 px-3 py-2 text-sm") +
            " flex flex-wrap items-start justify-between gap-3"
          }
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium">{it.title}</div>
            <div className="text-muted-foreground">{it.body}</div>
          </div>
          {it.action && (
            <div className="shrink-0">
              {it.action.kind === "anchor" ? (
                <a
                  href={it.action.href}
                  className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
                >
                  {it.action.label}
                </a>
              ) : it.action.kind === "external" ? (
                <a
                  href={it.action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
                >
                  {it.action.label}
                </a>
              ) : (
                <Link
                  to={it.action.to}
                  className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
                >
                  {it.action.label}
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

type AvailabilityState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "invalid"; message: string }
  | { kind: "reserved" }
  | { kind: "taken" }
  | { kind: "error"; message: string };

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function PublicAddressCard({
  agencyId,
  eventId,
  publicSlug,
  internalSlug,
  eventName,
  domains,
  canEdit,
  isPlatformAdmin,
  onChanged,
}: {
  agencyId: string | null;
  eventId: string;
  publicSlug: string | null;
  internalSlug: string | null;
  eventName: string;
  domains: Domain[];
  canEdit: boolean;
  isPlatformAdmin: boolean;
  onChanged: () => void;
}) {
  const subdomainRow = domains.find((d) => d.domain_type === "event_subdomain") ?? null;
  const otherDomains = domains.filter((d) => d.domain_type !== "event_subdomain");

  // Prefill from internal slug (lowercased). If blank, fall back to a
  // slugified event name. Never use public_slug — it may be a generated
  // placeholder like evt-xxxx and is not customer-friendly.
  const initialSuggestion = !subdomainRow
    ? (internalSlug && internalSlug.trim().length > 0
        ? internalSlug.toLowerCase()
        : slugifyName(eventName))
    : "";
  const [input, setInput] = useState(initialSuggestion);
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const normalized = input.trim().toLowerCase();

  // Debounced availability check via RPC.
  useEffect(() => {
    setSubmitError(null);
    if (!normalized) {
      setAvailability({ kind: "idle" });
      return;
    }
    if (normalized.length < 3 || normalized.length > 63) {
      setAvailability({ kind: "invalid", message: "Must be 3–63 characters." });
      return;
    }
    if (!SUBDOMAIN_RE.test(normalized)) {
      setAvailability({
        kind: "invalid",
        message:
          "Use lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.",
      });
      return;
    }

    setAvailability({ kind: "checking" });
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("validate_public_subdomain", {
        _candidate: normalized,
      });
      if (cancelled) return;
      if (error) {
        setAvailability({ kind: "error", message: "Could not check availability." });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.ok) {
        setAvailability({ kind: "available" });
        return;
      }
      switch (row?.reason) {
        case "length":
          setAvailability({ kind: "invalid", message: "Must be 3–63 characters." });
          break;
        case "format":
          setAvailability({ kind: "invalid", message: "Invalid format." });
          break;
        case "reserved":
          setAvailability({ kind: "reserved" });
          break;
        case "taken":
          setAvailability({ kind: "taken" });
          break;
        default:
          setAvailability({ kind: "error", message: "Not available." });
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [normalized]);

  async function handleClaim() {
    if (!agencyId || availability.kind !== "available") return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.from("event_domains").insert({
      agency_id: agencyId,
      event_id: eventId,
      public_subdomain: normalized,
      domain_type: "event_subdomain",
      status: "pending",
      is_primary: true,
      verified_at: null,
    });
    setSubmitting(false);
    if (error) {
      const msg = error.message ?? "Could not reserve subdomain.";
      if (/duplicate|unique/i.test(msg)) {
        setSubmitError("That subdomain was just taken. Please choose another.");
        setAvailability({ kind: "taken" });
      } else {
        setSubmitError(`Could not reserve subdomain: ${msg}`);
      }
      return;
    }
    setInput("");
    setAvailability({ kind: "idle" });
    onChanged();
  }

  async function handleRelease() {
    if (!subdomainRow || !agencyId) return;
    if (subdomainRow.status !== "pending") return; // safety
    if (!window.confirm("Release this pending subdomain? It will become available to others.")) {
      return;
    }
    setReleasing(true);
    setReleaseError(null);
    const { error } = await supabase
      .from("event_domains")
      .delete()
      .eq("id", subdomainRow.id)
      .eq("agency_id", agencyId)
      .eq("event_id", eventId)
      .eq("status", "pending");
    setReleasing(false);
    if (error) {
      setReleaseError(`Could not release subdomain: ${error.message}`);
      return;
    }
    onChanged();
  }

  const previewHost = normalized && availability.kind !== "invalid"
    ? `${normalized}.getstampd.com.au`
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Public event code</span>
          <span className="font-mono">{publicSlug ?? "—"}</span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Claimed subdomain</span>
          <span className="font-mono">
            {subdomainRow?.public_subdomain
              ? `${subdomainRow.public_subdomain}.getstampd.com.au`
              : "—"}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Status</span>
          <span>
            <StatusPill status={subdomainRow?.status ?? "not_claimed"} />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pick a friendly web address for your event on <span className="font-mono">getstampd.com.au</span>.
          You can reserve it now — it only goes live after billing/activation.
        </p>
      </div>

      {!subdomainRow && canEdit && (
        <div className="space-y-3 rounded-md border p-3">
          <label htmlFor="gs-subdomain" className="block text-sm font-medium">
            Choose your GetStampd subdomain
          </label>
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers and hyphens. 3–63 characters.
            Example: <span className="font-mono">orange-food-week</span>.
          </p>
          <div className="flex items-stretch gap-0">
            <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-2 text-xs text-muted-foreground">
              https://
            </span>
            <input
              id="gs-subdomain"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toLowerCase())}
              maxLength={63}
              placeholder="orange-food-week"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full border bg-background px-2 text-sm font-mono"
            />
            <span className="inline-flex items-center rounded-r-md border border-l-0 bg-muted px-2 text-xs text-muted-foreground">
              .getstampd.com.au
            </span>
          </div>

          {previewHost && (
            <div className="rounded-md border bg-background/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Preview: </span>
              <span className="font-mono break-all">https://{previewHost}</span>
            </div>
          )}

          <AvailabilityMessage state={availability} />

          {submitError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Reserving creates a <span className="font-medium">pending</span> address.
              It activates after billing.
            </p>
            <button
              type="button"
              onClick={handleClaim}
              disabled={submitting || availability.kind !== "available"}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Reserving…" : "Reserve subdomain"}
            </button>
          </div>
        </div>
      )}

      {!subdomainRow && !canEdit && (
        <EmptyNotice>No public address claimed yet. Ask an owner or admin to reserve one.</EmptyNotice>
      )}

      {subdomainRow && subdomainRow.status === "pending" && canEdit && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-sm">
            Pending reservation — will activate once billing/activation is complete.
          </div>
          {releaseError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {releaseError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleRelease}
              disabled={releasing}
              className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {releasing ? "Releasing…" : "Release subdomain"}
            </button>
          </div>
        </div>
      )}

      {subdomainRow && subdomainRow.status === "active" && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          Active subdomains are read-only here.
          {isPlatformAdmin && " Platform admins can change active domains via system admin."}
        </div>
      )}

      {otherDomains.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-[#E6ECF4] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.035)]">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wider text-[#64748B]">
              <tr>
                <th className="px-3 py-2 font-medium">Subdomain</th>
                <th className="px-3 py-2 font-medium">Custom</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Primary</th>
                <th className="px-3 py-2 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {otherDomains.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2">{d.public_subdomain ?? "—"}</td>
                  <td className="px-3 py-2">{d.custom_domain ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.domain_type}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={d.status} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{d.is_primary ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(d.verified_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "not_claimed"
      ? "not claimed"
      : status;
  const cls =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "pending"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : status === "revoked" || status === "disabled"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

function AvailabilityMessage({ state }: { state: AvailabilityState }) {
  if (state.kind === "idle") return null;
  const map = {
    checking: { cls: "text-muted-foreground", text: "Checking…" },
    available: { cls: "text-emerald-600 dark:text-emerald-400", text: "Available — will be reserved as pending." },
    invalid: { cls: "text-destructive", text: state.kind === "invalid" ? state.message : "" },
    reserved: { cls: "text-destructive", text: "Reserved word — please choose another." },
    taken: { cls: "text-destructive", text: "Already taken — please choose another." },
    error: { cls: "text-destructive", text: state.kind === "error" ? state.message : "" },
  } as const;
  const m = map[state.kind];
  return <div className={`text-xs ${m.cls}`}>{m.text}</div>;
}


function GoLivePanel({
  agencyId,
  eventId,
  eventStatus,
  domains,
  activation,
  isPlatformAdmin,
  onChanged,
}: {
  agencyId: string | null;
  eventId: string;
  eventStatus: string;
  domains: Domain[];
  activation: Activation | null;
  isPlatformAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const primarySubdomain =
    domains.find((d) => d.domain_type === "event_subdomain" && d.is_primary) ??
    domains.find((d) => d.domain_type === "event_subdomain") ??
    null;
  const primaryCustom =
    domains.find((d) => d.domain_type === "event_custom" && d.is_primary) ??
    domains.find((d) => d.domain_type === "event_custom") ??
    null;
  const primaryDomain = primarySubdomain ?? primaryCustom;

  const eventPass = eventStatus === "published";
  const domainPass = !!primaryDomain && primaryDomain.status === "active";
  const activationStatus = activation?.status ?? "unpaid";
  const activationPass = activationStatus === "active" || activationStatus === "comp";
  const allPass = eventPass && domainPass && activationPass;

  const publicUrl = primarySubdomain?.public_subdomain
    ? `https://${primarySubdomain.public_subdomain}.getstampd.com.au`
    : primaryCustom?.custom_domain
      ? `https://${primaryCustom.custom_domain}`
      : null;

  async function setEventStatus(next: "published" | "draft") {
    if (!agencyId) return;
    setBusy(`event:${next}`);
    const { error } = await supabase
      .from("events")
      .update({ status: next })
      .eq("id", eventId)
      .eq("agency_id", agencyId);
    setBusy(null);
    if (error) {
      toast.error("Could not update event status.");
      return;
    }
    toast.success(`Event marked ${next}.`);
    onChanged();
  }

  async function setDomainStatus(next: "active" | "pending") {
    if (!agencyId || !primarySubdomain) return;
    setBusy(`domain:${next}`);
    const { error } = await supabase
      .from("event_domains")
      .update({ status: next })
      .eq("id", primarySubdomain.id)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);
    setBusy(null);
    if (error) {
      toast.error("Could not update public address status.");
      return;
    }
    toast.success(`Public address set to ${next}.`);
    onChanged();
  }

  async function setActivation(
    status: "comp" | "unpaid",
    kind: "comp" | "one_time",
  ) {
    setBusy(`act:${status}`);
    const { error } = await supabase.rpc("platform_set_event_activation", {
      _event_id: eventId,
      _status: status,
      _activation_kind: kind,
      _expires_at: null,
    });
    setBusy(null);
    if (error) {
      toast.error("Could not update activation.");
      return;
    }
    toast.success("Activation updated.");
    onChanged();
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Go live status</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            All three gates must pass before this event is reachable publicly.
          </p>
        </div>
        <div
          className={
            allPass
              ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
              : "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
          }
        >
          {allPass ? "Ready to go live" : "Not live yet"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <GateCard
          title="Event"
          pass={eventPass}
          value={eventStatus}
          hint={eventPass ? "Published" : "Must be published"}
        />
        <GateCard
          title="Public address"
          pass={domainPass}
          value={
            primaryDomain
              ? primaryDomain.status
              : "not claimed"
          }
          hint={
            !primaryDomain
              ? "No subdomain claimed"
              : domainPass
                ? "Active"
                : "Must be active"
          }
        />
        <GateCard
          title="Commercial activation"
          pass={activationPass}
          value={activationStatus}
          hint={activationPass ? "Active or comp" : "Must be active or comp"}
        />
      </div>

      <div className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium text-muted-foreground">Public URL: </span>
        {publicUrl ? (
          <code className="break-all">{publicUrl}</code>
        ) : (
          <span className="text-muted-foreground">Public address not claimed</span>
        )}
      </div>

      {primarySubdomain?.public_subdomain && (
        <div className="mt-2 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs">
          <a
            href={`/live/${primarySubdomain.public_subdomain}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Test live public page →
          </a>
          <span className="ml-2 text-muted-foreground">
            Simulates {primarySubdomain.public_subdomain}.getstampd.com.au. Only
            shows the event when all three go-live gates pass.
          </span>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        When all three gates pass, <code>resolve_event_by_host</code> should return
        <code> kind = event</code> for the public URL.
      </p>

      {isPlatformAdmin && (
        <div className="mt-5 rounded-lg border border-dashed bg-amber-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Platform testing only
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Stripe billing will control these gates later. Change each gate explicitly.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs font-medium">Event status</div>
              <div className="flex flex-wrap gap-2">
                <AdminBtn
                  onClick={() => setEventStatus("published")}
                  disabled={busy !== null || eventStatus === "published"}
                  busy={busy === "event:published"}
                >
                  Mark published
                </AdminBtn>
                <AdminBtn
                  onClick={() => setEventStatus("draft")}
                  disabled={busy !== null || eventStatus === "draft"}
                  busy={busy === "event:draft"}
                >
                  Set draft
                </AdminBtn>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Public address</div>
              {primarySubdomain ? (
                <div className="flex flex-wrap gap-2">
                  <AdminBtn
                    onClick={() => setDomainStatus("active")}
                    disabled={busy !== null || primarySubdomain.status === "active"}
                    busy={busy === "domain:active"}
                  >
                    Activate
                  </AdminBtn>
                  <AdminBtn
                    onClick={() => setDomainStatus("pending")}
                    disabled={busy !== null || primarySubdomain.status === "pending"}
                    busy={busy === "domain:pending"}
                  >
                    Set pending
                  </AdminBtn>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Claim a subdomain in Public address first.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Commercial activation</div>
              <div className="flex flex-wrap gap-2">
                <AdminBtn
                  onClick={() => setActivation("comp", "comp")}
                  disabled={busy !== null}
                  busy={busy === "act:comp"}
                >
                  Comp activate
                </AdminBtn>
                <AdminBtn
                  onClick={() => setActivation("unpaid", "one_time")}
                  disabled={busy !== null}
                  busy={busy === "act:unpaid"}
                >
                  Set unpaid
                </AdminBtn>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GateCard({
  title,
  pass,
  value,
  hint,
}: {
  title: string;
  pass: boolean;
  value: string;
  hint: string;
}) {
  return (
    <div
      className={
        pass
          ? "rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3"
          : "rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span
          className={
            pass
              ? "text-xs font-semibold text-emerald-700 dark:text-emerald-300"
              : "text-xs font-semibold text-amber-700 dark:text-amber-300"
          }
        >
          {pass ? "PASS" : "BLOCKED"}
        </span>
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function AdminBtn({
  onClick,
  disabled,
  busy,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

// =====================================================================
// LaunchReadinessChecklist
// =====================================================================
// Operational readiness panel for organisation owners/admins. Visible to
// every authenticated admin viewing this event — NOT gated behind the
// platform-admin Diagnostics flag. Pure presentation: reflects existing
// data, does not introduce new publishing restrictions.
// =====================================================================

type CheckStatus = "ready" | "recommended" | "attention" | "blocking";

type CheckItem = {
  label: string;
  status: CheckStatus;
  detail?: string;
  action?: React.ReactNode;
};

type CheckSection = {
  id: string;
  title: string;
  items: CheckItem[];
};

function statusMeta(s: CheckStatus) {
  switch (s) {
    case "ready":
      return { label: "Ready", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" };
    case "recommended":
      return { label: "Recommended", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" };
    case "attention":
      return { label: "Needs attention", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" };
    case "blocking":
      return { label: "Blocking", cls: "border-destructive/40 bg-destructive/10 text-destructive", dot: "bg-destructive" };
  }
}

function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success("Link copied");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy");
        }
      }}
      className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function OpenLinkButton({ href, label = "Open" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
    >
      {label}
    </a>
  );
}

function AnchorButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
    >
      {label}
    </a>
  );
}

function LaunchReadinessChecklist({
  event,
  domains,
  terms,
  venues,
  qrByVenue,
  activation,
  leaderboard,
}: {
  event: EventRow;
  domains: Domain[];
  terms: TermsVersion | null;
  venues: Venue[];
  qrByVenue: Map<string, QrSummary>;
  activation: Activation | null;
  leaderboard: LeaderboardSettings | null;
}) {
  const primarySub =
    domains.find((d) => d.domain_type === "event_subdomain" && d.status === "active" && d.is_primary) ??
    domains.find((d) => d.domain_type === "event_subdomain" && d.status === "active") ??
    domains.find((d) => d.domain_type === "event_subdomain") ??
    null;
  const primaryCustom =
    domains.find((d) => d.domain_type === "event_custom" && d.status === "active" && d.is_primary) ??
    domains.find((d) => d.domain_type === "event_custom" && d.status === "active") ??
    null;
  const sub = primarySub?.public_subdomain ?? null;
  const publicUrl = sub
    ? tenantUrl(sub)
    : primaryCustom?.custom_domain
      ? `https://${primaryCustom.custom_domain}`
      : null;
  const joinUrl = publicUrl ? `${publicUrl}/join` : null;
  const mapUrl = publicUrl ? `${publicUrl}/map` : null;
  const leaderboardUrl = publicUrl ? `${publicUrl}/leaderboard` : null;
  const termsUrl = publicUrl ? `${publicUrl}/terms` : null;
  const privacyUrl = publicUrl ? `${publicUrl}/privacy` : null;

  const activeVenues = venues.filter((v) => v.status === "active");
  const venuesMissingAddress = activeVenues.filter((v) => !v.address || !v.address.trim());
  const venuesMissingCoords = activeVenues.filter(
    (v) => !Number.isFinite(v.lat ?? NaN) || !Number.isFinite(v.lng ?? NaN) || v.lat === 0 || v.lng === 0,
  );
  const venuesMissingImage = activeVenues.filter((v) => !v.logo_path && !v.cover_path);
  const venuesMissingQr = activeVenues.filter((v) => !qrByVenue.has(v.id));

  // ----- 1. Event basics ---------------------------------------------
  const basics: CheckItem[] = [];
  basics.push({
    label: "Event name",
    status: event.name?.trim() ? "ready" : "blocking",
    detail: event.name?.trim() ? event.name : "Not set",
  });
  basics.push({
    label: "Start & end dates",
    status: event.starts_at && event.ends_at ? "ready" : "recommended",
    detail:
      event.starts_at && event.ends_at
        ? `${fmt(event.starts_at)} → ${fmt(event.ends_at)}`
        : "Dates help visitors know when the trail runs.",
  });
  basics.push({
    label: "Event status",
    status: event.status === "published" ? "ready" : event.status === "archived" ? "attention" : "recommended",
    detail: event.status,
    action: <AnchorButton href="#section-go-live" label="Go live" />,
  });
  basics.push({
    label: "Public subdomain",
    status: sub ? "ready" : "blocking",
    detail: sub ? tenantHost(sub) : "No subdomain claimed",
    action: <AnchorButton href="#section-public-address" label="Configure" />,
  });

  // ----- 2. Public address -------------------------------------------
  const publicAddr: CheckItem[] = [];
  publicAddr.push({
    label: "Public event URL",
    status: publicUrl ? "ready" : "blocking",
    detail: publicUrl ?? "Available once a subdomain is active.",
    action: publicUrl ? (
      <span className="flex gap-1">
        <CopyLinkButton url={publicUrl} />
        <OpenLinkButton href={publicUrl} />
      </span>
    ) : undefined,
  });
  publicAddr.push({
    label: "Primary domain active",
    status:
      (primarySub && primarySub.status === "active") || (primaryCustom && primaryCustom.status === "active")
        ? "ready"
        : primarySub || primaryCustom
          ? "attention"
          : "blocking",
    detail: primarySub
      ? `subdomain · ${primarySub.status}${primarySub.is_primary ? " · primary" : ""}`
      : primaryCustom
        ? `custom · ${primaryCustom.status}`
        : "No domain claimed",
    action: <AnchorButton href="#section-public-address" label="Manage" />,
  });

  // ----- 3. Terms & privacy ------------------------------------------
  const legal: CheckItem[] = [];
  legal.push({
    label: "Terms configured",
    status: terms ? "ready" : "blocking",
    detail: terms
      ? `v${terms.terms_version} · ${terms.legal_source === "local_text" ? "local text" : "external URL"}`
      : "No terms version set.",
    action: <AnchorButton href="#section-terms" label="Edit terms" />,
  });
  legal.push({
    label: "Privacy configured",
    status: terms && (terms.privacy_body || terms.privacy_url) ? "ready" : "blocking",
    detail: terms
      ? `v${terms.privacy_version}`
      : "No privacy version set.",
    action: <AnchorButton href="#section-terms" label="Edit privacy" />,
  });
  legal.push({
    label: "Current terms version pinned to event",
    status: event.current_terms_version_id ? "ready" : "attention",
    detail: event.current_terms_version_id ?? "Not set",
  });
  if (termsUrl && privacyUrl) {
    legal.push({
      label: "Public legal pages",
      status: "ready",
      detail: "Visitors can view terms and privacy from the public site.",
      action: (
        <span className="flex gap-1">
          <OpenLinkButton href={termsUrl} label="Open /terms" />
          <OpenLinkButton href={privacyUrl} label="Open /privacy" />
        </span>
      ),
    });
  }

  // ----- 4. Venues ---------------------------------------------------
  const venuesChecks: CheckItem[] = [];
  venuesChecks.push({
    label: "At least one active venue",
    status: activeVenues.length > 0 ? "ready" : "blocking",
    detail:
      activeVenues.length > 0
        ? `${activeVenues.length} active venue${activeVenues.length === 1 ? "" : "s"}`
        : "Add at least one stop on the trail.",
    action: <AnchorButton href="#section-venues" label="Add venue" />,
  });
  venuesChecks.push({
    label: "All venues have an address",
    status: venuesMissingAddress.length === 0 ? "ready" : "attention",
    detail:
      venuesMissingAddress.length === 0
        ? "All addresses set."
        : `${venuesMissingAddress.length} missing: ${venuesMissingAddress.map((v) => v.name).join(", ")}`,
    action: <AnchorButton href="#section-venues" label="Fix venues" />,
  });
  venuesChecks.push({
    label: "All venues mapped (lat/lng)",
    status: venuesMissingCoords.length === 0 ? "ready" : "attention",
    detail:
      venuesMissingCoords.length === 0
        ? "All venues will show on the trail map."
        : `Unmapped: ${venuesMissingCoords.map((v) => v.name).join(", ")}`,
    action: <AnchorButton href="#section-venues" label="Set location" />,
  });
  venuesChecks.push({
    label: "Venue images",
    status: venuesMissingImage.length === 0 ? "ready" : "recommended",
    detail:
      venuesMissingImage.length === 0
        ? "All venues have a logo or cover."
        : `Recommended — missing on ${venuesMissingImage.length} venue${venuesMissingImage.length === 1 ? "" : "s"}.`,
  });
  if (sub) {
    venuesChecks.push({
      label: "Public venue pages reachable",
      status: activeVenues.length > 0 ? "ready" : "recommended",
      detail: activeVenues.length > 0
        ? `e.g. ${tenantUrl(sub, `/venues/${activeVenues[0].id}`)}`
        : "Available once a venue is added.",
      action: activeVenues.length > 0 ? (
        <OpenLinkButton href={tenantUrl(sub, `/venues/${activeVenues[0].id}`)} label="Open sample" />
      ) : undefined,
    });
  }

  // ----- 5. QR / check-in --------------------------------------------
  const qrChecks: CheckItem[] = [];
  qrChecks.push({
    label: "Active QR per venue",
    status:
      activeVenues.length === 0
        ? "recommended"
        : venuesMissingQr.length === 0
          ? "ready"
          : "attention",
    detail:
      activeVenues.length === 0
        ? "Add venues first."
        : venuesMissingQr.length === 0
          ? "Every active venue has a QR ready to scan."
          : `Missing QR: ${venuesMissingQr.map((v) => v.name).join(", ")}`,
    action:
      venuesMissingQr.length > 0
        ? <AnchorButton href="#section-venues" label="Generate QR" />
        : undefined,
  });

  // ----- 6. Passport flow --------------------------------------------
  const passport: CheckItem[] = [];
  passport.push({
    label: "Join / passport URL",
    status: joinUrl ? "ready" : "blocking",
    detail: joinUrl ?? "Available once subdomain is claimed.",
    action: joinUrl ? (
      <span className="flex gap-1">
        <CopyLinkButton url={joinUrl} />
        <OpenLinkButton href={joinUrl} />
      </span>
    ) : undefined,
  });

  // ----- 7. Trail map ------------------------------------------------
  const mapChecks: CheckItem[] = [];
  mapChecks.push({
    label: "Trail map URL",
    status: mapUrl ? "ready" : "blocking",
    detail: mapUrl ?? "Available once subdomain is claimed.",
    action: mapUrl ? (
      <span className="flex gap-1">
        <CopyLinkButton url={mapUrl} />
        <OpenLinkButton href={mapUrl} />
      </span>
    ) : undefined,
  });
  mapChecks.push({
    label: "Map has mappable venues",
    status:
      activeVenues.length === 0
        ? "recommended"
        : activeVenues.length - venuesMissingCoords.length > 0
          ? venuesMissingCoords.length === 0
            ? "ready"
            : "attention"
          : "attention",
    detail:
      activeVenues.length === 0
        ? "No venues yet."
        : venuesMissingCoords.length === 0
          ? `${activeVenues.length} venue${activeVenues.length === 1 ? "" : "s"} will render on the map.`
          : `Map warning — ${venuesMissingCoords.length} venue${venuesMissingCoords.length === 1 ? "" : "s"} missing coordinates: ${venuesMissingCoords.map((v) => v.name).join(", ")}`,
    action: venuesMissingCoords.length > 0
      ? <AnchorButton href="#section-venues" label="Add locations" />
      : undefined,
  });

  // ----- 8. Leaderboard ----------------------------------------------
  const lbChecks: CheckItem[] = [];
  lbChecks.push({
    label: "Leaderboard enabled",
    status: leaderboard?.is_enabled ? "ready" : "recommended",
    detail: leaderboard?.is_enabled ? "Visible to visitors." : "Optional — turn on to add competition.",
    action: <AnchorButton href="#section-leaderboard" label="Configure" />,
  });
  if (leaderboardUrl) {
    lbChecks.push({
      label: "Leaderboard URL",
      status: "ready",
      detail: leaderboardUrl,
      action: (
        <span className="flex gap-1">
          <CopyLinkButton url={leaderboardUrl} />
          <OpenLinkButton href={leaderboardUrl} />
        </span>
      ),
    });
  }

  // ----- 9. Publish gate (friendly summary) --------------------------
  const eventPass = event.status === "published";
  const primaryDomain = primarySub ?? primaryCustom;
  const domainPass = !!primaryDomain && primaryDomain.status === "active";
  const activationStatus = activation?.status ?? "unpaid";
  const activationPass = activationStatus === "active" || activationStatus === "comp";
  const publishGate: CheckItem[] = [
    {
      label: "Event status published",
      status: eventPass ? "ready" : "blocking",
      detail: event.status,
    },
    {
      label: "Primary domain active",
      status: domainPass ? "ready" : "blocking",
      detail: primaryDomain
        ? `${primaryDomain.status}${primaryDomain.is_primary ? " · primary" : " · not primary"}`
        : "No domain",
    },
    {
      label: "Commercial activation",
      status: activationPass ? "ready" : "blocking",
      detail: `${activationStatus}${activation?.activation_kind ? ` · ${activation.activation_kind}` : ""}`,
    },
  ];

  const sections: CheckSection[] = [
    { id: "basics", title: "Event basics", items: basics },
    { id: "public-address", title: "Public address", items: publicAddr },
    { id: "legal", title: "Terms & privacy", items: legal },
    { id: "venues", title: "Venues", items: venuesChecks },
    { id: "qr", title: "QR & check-in", items: qrChecks },
    { id: "passport", title: "Passport flow", items: passport },
    { id: "map", title: "Trail map", items: mapChecks },
    { id: "leaderboard", title: "Leaderboard", items: lbChecks },
    { id: "publish-gate", title: "Publish gate", items: publishGate },
  ];

  const allItems = sections.flatMap((s) => s.items);
  const blockingCount = allItems.filter((i) => i.status === "blocking").length;
  const attentionCount = allItems.filter((i) => i.status === "attention").length;
  const recommendedCount = allItems.filter((i) => i.status === "recommended").length;
  const readyCount = allItems.filter((i) => i.status === "ready").length;

  const overall: CheckStatus =
    blockingCount > 0 ? "blocking" : attentionCount > 0 ? "attention" : recommendedCount > 0 ? "recommended" : "ready";
  const overallMeta = statusMeta(overall);
  const overallHeadline =
    overall === "ready"
      ? "Ready to share with visitors"
      : overall === "recommended"
        ? "Ready — a few nice-to-haves left"
        : overall === "attention"
          ? "Almost ready — items need attention"
          : "Setup incomplete";

  const [expanded, setExpanded] = useState(false);

  return (
    <section className="mb-6 rounded-xl border bg-card p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold">Launch readiness</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything an organiser should confirm before sharing the public trail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`rounded-md border px-3 py-1 text-xs font-semibold ${overallMeta.cls}`}>
            {overallHeadline}
          </div>
          <span
            aria-hidden
            className={`inline-block text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </div>
      </button>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> {readyCount} ready
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> {recommendedCount} recommended
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> {attentionCount} needs attention
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
          <span className="inline-block h-2 w-2 rounded-full bg-destructive" /> {blockingCount} blocking
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto inline-flex items-center rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
        >
          {expanded ? "Hide checklist" : "Show checklist"}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {sections.map((sec) => (
            <div key={sec.id} className="rounded-lg border bg-background/40 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {sec.title}
              </div>
              <ul className="space-y-2">
                {sec.items.map((it, idx) => {
                  const m = statusMeta(it.status);
                  return (
                    <li key={idx} className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${m.dot}`} aria-hidden />
                          <span className="text-sm font-medium">{it.label}</span>
                          <span className={`hidden sm:inline rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m.cls}`}>
                            {m.label}
                          </span>
                        </div>
                        {it.detail && (
                          <div className="mt-0.5 break-words pl-4 text-xs text-muted-foreground">{it.detail}</div>
                        )}
                      </div>
                      {it.action && <div className="shrink-0">{it.action}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
