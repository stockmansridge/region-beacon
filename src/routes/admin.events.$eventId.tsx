import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
};

type Branding = {
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
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
};

type QrSummary = {
  venue_id: string;
  status: string;
  issued_at: string;
  // Optional: the `entry_value` column is added by the prize-draw migration
  // (supabase/migrations-draft-rewards-prize-draw). In environments where
  // that migration has not yet been applied, the loader degrades to null.
  entry_value: number | null;
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
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);




  const [isEditingCheckin, setIsEditingCheckin] = useState(false);
  const [checkinForm, setCheckinForm] = useState<CheckinEditForm | null>(null);
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinSaveError, setCheckinSaveError] = useState<string | null>(null);
  const [checkinValidationError, setCheckinValidationError] = useState<string | null>(null);

  const [isEditingLeaderboard, setIsEditingLeaderboard] = useState(false);
  const [lbForm, setLbForm] = useState<LeaderboardEditForm | null>(null);
  const [lbSaving, setLbSaving] = useState(false);
  const [lbSaveError, setLbSaveError] = useState<string | null>(null);
  const [lbValidationError, setLbValidationError] = useState<string | null>(null);

  // Venue editor: "new" = creating, string = editing existing id, null = closed.
  const [venueEditingId, setVenueEditingId] = useState<string | "new" | null>(null);
  const [venueForm, setVenueForm] = useState<VenueEditForm | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueSaveError, setVenueSaveError] = useState<string | null>(null);
  const [venueValidationError, setVenueValidationError] = useState<string | null>(null);
  const [venueArchivingId, setVenueArchivingId] = useState<string | null>(null);
  const [venueArchiveError, setVenueArchiveError] = useState<string | null>(null);
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
          "No agency is selected for the current session. Switch to an agency in the workspace switcher before opening this event.",
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
            "id, agency_id, name, slug, public_slug, status, timezone, starts_at, ends_at, description, created_at, updated_at, current_terms_version_id",
          )
          .eq("id", eventId)
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
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
              .select("logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url")
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
                "id, name, address, lat, lng, status, order_index, description, website_url, phone, logo_path, cover_path",
              )
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .is("deleted_at", null)
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
          const baseCols = "venue_id, status, issued_at";
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
    setIsEditing(false);
    setForm(null);
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
    setIsEditingCheckin(false);
    setCheckinForm(null);
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
    setIsEditingLeaderboard(false);
    setLbForm(null);
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
    // Refresh in case a venue was just created (we skipped reload then to keep
    // the editor mounted for image upload).
    setReloadKey((k) => k + 1);
  }

  async function saveVenue() {
    if (!venueForm || !agencyId || !bundle || !venueEditingId) return;

    const name = venueForm.name.trim();
    if (!name) {
      setVenueValidationError("Name is required.");
      return;
    }
    if (name.length > 150) {
      setVenueValidationError("Name must be 150 characters or fewer.");
      return;
    }
    const addressRaw = venueForm.address.trim();
    if (addressRaw.length > 300) {
      setVenueValidationError("Address must be 300 characters or fewer.");
      return;
    }
    const address = addressRaw === "" ? null : addressRaw;

    let lat: number | null = null;
    if (venueForm.lat.trim() !== "") {
      const parsed = Number(venueForm.lat.trim());
      if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
        setVenueValidationError("Latitude must be a number between -90 and 90.");
        return;
      }
      lat = parsed;
    }
    let lng: number | null = null;
    if (venueForm.lng.trim() !== "") {
      const parsed = Number(venueForm.lng.trim());
      if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
        setVenueValidationError("Longitude must be a number between -180 and 180.");
        return;
      }
      lng = parsed;
    }
    const orderIndex = parseInt(venueForm.order_index, 10);
    if (Number.isNaN(orderIndex) || orderIndex < 0) {
      setVenueValidationError("Order must be a whole number >= 0.");
      return;
    }
    if (venueForm.status !== "active" && venueForm.status !== "inactive") {
      setVenueValidationError("Status must be active or inactive.");
      return;
    }

    const description = venueForm.description.trim();
    if (description.length > 1200) {
      setVenueValidationError("Description must be 1200 characters or fewer.");
      return;
    }
    const offerSummary = venueForm.offer_summary.trim();
    if (bundle.offerSupported && offerSummary.length > 800) {
      setVenueValidationError("Offer summary must be 800 characters or fewer.");
      return;
    }
    const website = venueForm.website_url.trim();
    if (website.length > 0 && !/^https:\/\//i.test(website)) {
      setVenueValidationError("Website URL must start with https://");
      return;
    }
    const phone = venueForm.phone.trim();
    if (phone.length > 40) {
      setVenueValidationError("Phone must be 40 characters or fewer.");
      return;
    }
    if (phone.length > 0 && !/^\+?[0-9 \-]{6,40}$/.test(phone)) {
      setVenueValidationError("Phone may only contain digits, spaces, dashes, and an optional leading +.");
      return;
    }

    setVenueValidationError(null);
    setVenueSaveError(null);
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

    let error: { message: string } | null = null;
    let newVenueId: string | null = null;
    if (venueEditingId === "new") {
      const { data: insData, error: inErr } = await supabase
        .from("venues")
        .insert({
          agency_id: agencyId,
          event_id: eventId,
          ...patch,
        })
        .select("id")
        .single();
      error = inErr ?? null;
      newVenueId = (insData?.id as string | undefined) ?? null;
    } else {
      const { error: upErr } = await supabase
        .from("venues")
        .update(patch)
        .eq("id", venueEditingId)
        .eq("event_id", eventId)
        .eq("agency_id", agencyId);
      error = upErr ?? null;
    }

    setVenueSaving(false);
    if (error) {
      setVenueSaveError("Could not save venue. Please try again.");
      return;
    }
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

  async function archiveVenue(venueId: string) {
    if (!agencyId) return;
    if (!window.confirm("Archive this venue? It will be hidden from the active list.")) return;
    setVenueArchivingId(venueId);
    setVenueArchiveError(null);
    const { error } = await supabase
      .from("venues")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", venueId)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);
    setVenueArchivingId(null);
    if (error) {
      setVenueArchiveError("Could not archive venue. Please try again.");
      return;
    }
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

  return (
    <>
      <PageHeader
        title={event.name}
        description={
          isEditing
            ? `Editing basics · status: ${event.status}`
            : `Read-only view · status: ${event.status}`
        }
        actions={
          isEditing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/admin/events/$eventId/preview"
                params={{ eventId: bundle.event.id }}
                target="_blank"
                className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                Preview customer page
              </Link>
              {canEdit && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
                >
                  Edit basics
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={archiveEvent}
                  disabled={deleting}
                  title="Archive this event (soft delete). Existing records are preserved."
                  className="inline-flex h-9 items-center rounded-lg border border-destructive/40 bg-destructive/5 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {deleting ? "Archiving…" : "Archive event"}
                </button>
              )}
            </div>
          )
        }

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

      {(() => {
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
        return (
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
            activePublicSubdomain={activeSub?.public_subdomain ?? null}
          />
        );
      })()}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Basics">
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
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    maxLength={64}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Starts at">
                    <input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    />
                  </Field>
                  <Field label="Ends at">
                    <input
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Internal slug, public slug, and status remain read-only here.
                </p>
              </div>
            ) : (
              <DefList
                rows={[
                  ["Name", event.name],
                  ["Internal slug", event.slug],
                  ["Public slug", event.public_slug ?? "—"],
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


          <Section title="Branding" id="section-branding">
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
              <DefList
                rows={[
                  ["Primary colour", <ColorSwatch key="p" value={branding.primary_color} />],
                  ["Accent colour", <ColorSwatch key="a" value={branding.accent_color} />],
                  ["Font family", branding.font_family ?? "—"],
                  [
                    "Welcome copy",
                    branding.welcome_copy
                      ? branding.welcome_copy.length > 140
                        ? `${branding.welcome_copy.slice(0, 140)}…`
                        : branding.welcome_copy
                      : "—",
                  ],
                  ["Terms URL", branding.terms_url ?? "—"],
                ]}
              />
            ) : (
              <EmptyNotice>No branding configured yet.</EmptyNotice>
            )}
          </Section>


          <Section title="Public address" id="section-public-address">
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


          <Section
            id="section-venues"
            title="Venues for this event"
            description="Add and manage the venues/stops that visitors can collect stamps from for this event."
          >
            {canEdit && venueEditingId === null && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={startCreateVenue}
                  className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
                >
                  Add venue
                </button>
              </div>
            )}
            {venueArchiveError && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {venueArchiveError}
              </div>
            )}
            {venueEditingId !== null && venueForm && (
              <div ref={venueEditorRef} className="mb-4 space-y-5 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">
                    {venueEditingId === "new" ? "New venue" : "Edit venue details"}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelVenueEdit}
                      disabled={venueSaving}
                      className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveVenue}
                      disabled={venueSaving}
                      className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {venueSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                {(venueValidationError || venueSaveError) && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {venueValidationError ?? venueSaveError}
                  </div>
                )}

                {venueEditingId === "new" ? (
                  <div className="space-y-4">
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
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
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        What visitors can expect — tasting offer, discount, bonus stamp, etc. {venueForm.offer_summary.length}/800
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
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
            {venues.length === 0 ? (
              <EmptyNotice>No venues yet.</EmptyNotice>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Address</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Active QR</th>
                      <th className="px-3 py-2 font-medium">Issued</th>
                      {canEdit && <th className="px-3 py-2 font-medium">QR controls</th>}
                      {canEdit && <th className="px-3 py-2 font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((v) => {
                      const qr = qrByVenue.get(v.id);
                      const hasActiveQr = !!qr;
                      const revealed = revealedQrByVenue.get(v.id);
                      const isBusy = qrActionVenueId === v.id;
                      const built = revealed ? buildCheckinUrl(revealed) : null;
                      return (
                        <tr
                          key={v.id}
                          onClick={() => {
                            if (canEdit && venueEditingId === null && venueArchivingId === null) {
                              startEditVenue(v);
                            }
                          }}
                          className={
                            "border-t align-top " +
                            (canEdit && venueEditingId === null && venueArchivingId === null
                              ? "cursor-pointer transition-colors hover:bg-muted/40"
                              : "")
                          }
                          title={canEdit && venueEditingId === null ? "Open venue details" : undefined}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{v.order_index}</td>
                          <td className="px-3 py-2 font-medium">
                            {canEdit ? (
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
                              v.name
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{v.address ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{v.status}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {hasActiveQr ? (
                              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                                {qr!.status}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/70">none</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmt(qr?.issued_at)}</td>
                          {canEdit && (
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              {hasActiveQr ? (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {revealed ? (
                                      <button
                                        type="button"
                                        onClick={() => hideQr(v.id)}
                                        className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                                      >
                                        Hide
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => revealQr(v.id)}
                                        disabled={isBusy}
                                        className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                      >
                                        {isBusy ? "Loading…" : "Reveal QR link"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => copyQrLink(v.id)}
                                      disabled={isBusy}
                                      className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                    >
                                      {qrCopiedVenueId === v.id ? "Copied" : "Copy link"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => generateOrRotateQr(v.id, true)}
                                      disabled={isBusy}
                                      className="inline-flex h-7 items-center rounded-md border border-amber-500/40 bg-background px-2 text-xs font-medium text-amber-700 hover:bg-amber-500/5 disabled:opacity-50 dark:text-amber-400"
                                    >
                                      {isBusy ? "Working…" : "Rotate QR"}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/20 px-2 py-1.5">
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
                                      className="h-7 w-16 rounded-md border bg-background px-2 text-xs"
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
                                          className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                        >
                                          {saving ? "Saving…" : "Save"}
                                        </button>
                                      );
                                    })()}
                                    <span className="basis-full text-[10px] leading-tight text-muted-foreground">
                                      Changes apply to future scans only. Existing check-ins keep the value earned at scan time.
                                    </span>
                                  </div>
                                  {revealed && built && (
                                    <div className="flex flex-col gap-2">
                                      <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] font-mono break-all text-foreground">
                                        {built.url}
                                        {built.isFallback && (
                                          <span className="ml-2 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-sans font-medium text-amber-700 dark:text-amber-400">
                                            demo/fallback URL — no active public subdomain
                                          </span>
                                        )}
                                      </div>
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
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => generateOrRotateQr(v.id, false)}
                                  disabled={isBusy}
                                  className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                >
                                  {isBusy ? "Generating…" : "Generate QR"}
                                </button>
                              )}
                            </td>
                          )}
                          {canEdit && (
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); startEditVenue(v); }}
                                  disabled={venueEditingId !== null || venueArchivingId !== null}
                                  className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                >
                                  Edit details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => archiveVenue(v.id)}
                                  disabled={venueEditingId !== null || venueArchivingId !== null}
                                  className="inline-flex h-7 items-center rounded-md border border-destructive/40 bg-background px-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                                >
                                  {venueArchivingId === v.id ? "Archiving…" : "Archive"}
                                </button>
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
          </Section>

          <Section title="Announcements" id="section-announcements" description="Customer-facing notices shown at the top of public event pages.">
            <AdminEventAnnouncements
              eventId={event.id}
              agencyId={event.agency_id}
              canEdit={canEdit}
            />
          </Section>
        </div>


        <aside className="space-y-4">
          <Section title="Terms & privacy" id="section-terms">
            {terms ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setTermsDialogOpen(true)}
                      className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
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
                                className="text-primary underline-offset-2 hover:underline break-all"
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
                                className="text-primary underline-offset-2 hover:underline break-all"
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
              <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <div className="font-medium">Terms & privacy not configured</div>
                <p className="mt-1 text-xs text-amber-800">
                  Visitor registration on the public join page is blocked until an active
                  terms version is set for this event.
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setTermsDialogOpen(true)}
                    className="mt-2 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Configure terms & privacy
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-amber-800">
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


          <Section title="Check-in settings">
            {isEditingCheckin && checkinForm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditCheckin}
                    disabled={checkinSaving}
                    className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditCheckin}
                    disabled={checkinSaving}
                    className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {checkinSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                {(checkinValidationError || checkinSaveError) && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {checkinValidationError ?? checkinSaveError}
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checkinForm.one_checkin_per_venue}
                    onChange={(e) => setCheckinForm({ ...checkinForm, one_checkin_per_venue: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">One check-in per venue</span>
                </label>
                <Field label="Minimum seconds between check-ins" required>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={checkinForm.minimum_seconds_between_checkins}
                    onChange={(e) => setCheckinForm({ ...checkinForm, minimum_seconds_between_checkins: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  />
                </Field>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checkinForm.allow_manual_admin_checkins}
                    onChange={(e) => setCheckinForm({ ...checkinForm, allow_manual_admin_checkins: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">Allow manual admin check-ins</span>
                </label>
                <Field label="Max check-ins per passport per day">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={checkinForm.max_checkins_per_passport_per_day}
                    onChange={(e) => setCheckinForm({ ...checkinForm, max_checkins_per_passport_per_day: e.target.value })}
                    placeholder="Leave blank for unlimited"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for unlimited.</p>
                </Field>
              </div>
            ) : (
              <>
                {canEdit && (
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={startEditCheckin}
                      className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
                    >
                      Edit check-in settings
                    </button>
                  </div>
                )}
                {checkin ? (
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
              </>
            )}
          </Section>

          <Section title="Leaderboard" id="section-leaderboard">
            {isEditingLeaderboard && lbForm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditLeaderboard}
                    disabled={lbSaving}
                    className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditLeaderboard}
                    disabled={lbSaving}
                    className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {lbSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Public leaderboard display is privacy-limited. Visitor email, mobile, postcode,
                  and full name are never shown. Default display is first name + last initial.
                </p>
                {(lbValidationError || lbSaveError) && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {lbValidationError ?? lbSaveError}
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lbForm.is_enabled}
                    onChange={(e) => setLbForm({ ...lbForm, is_enabled: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">Public leaderboard enabled</span>
                </label>
                <Field label="Display mode" required>
                  <select
                    value={lbForm.display_mode}
                    onChange={(e) =>
                      setLbForm({ ...lbForm, display_mode: e.target.value as LeaderboardDisplayMode })
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="first_name_last_initial">First name + last initial</option>
                    <option value="first_name_only">First name only</option>
                    <option value="alias_only">Alias only</option>
                    <option value="anonymous">Anonymous</option>
                  </select>
                </Field>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lbForm.show_first_name}
                    onChange={(e) => setLbForm({ ...lbForm, show_first_name: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">Show first name</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lbForm.show_last_initial}
                    onChange={(e) => setLbForm({ ...lbForm, show_last_initial: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">Show last initial</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lbForm.show_visit_count}
                    onChange={(e) => setLbForm({ ...lbForm, show_visit_count: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">Show visit count</span>
                </label>
                <Field label="Hide below check-ins" required>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={lbForm.hide_below_checkins}
                    onChange={(e) => setLbForm({ ...lbForm, hide_below_checkins: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Visitors below this number of check-ins are hidden from the public leaderboard.
                  </p>
                </Field>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lbForm.allow_visitor_opt_out}
                    onChange={(e) => setLbForm({ ...lbForm, allow_visitor_opt_out: e.target.checked })}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">Allow visitors to opt out</span>
                </label>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap justify-end gap-2">
                  <Link
                    to="/admin/events/$eventId/leaderboard"
                    params={{ eventId: bundle.event.id }}
                    className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
                  >
                    Open leaderboard
                  </Link>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={startEditLeaderboard}
                      className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
                    >
                      Edit leaderboard settings
                    </button>
                  )}
                </div>
                {leaderboard ? (
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
              </>
            )}
          </Section>

          <Section title="Reward tiers" id="section-rewards">
            <AdminEventRewards
              agencyId={event.agency_id}
              eventId={event.id}
              canEdit={canEdit}
            />
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border bg-card p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DefList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
          <dd className="text-sm break-words">{v}</dd>
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

function EmptyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
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
          "Legacy *.getstamped.com.au host used because DB resolve_event_by_host suffix migration is pending; customer-facing URL still uses " +
          PUBLIC_TENANT_ROOT_DOMAIN,
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
              (d) DB <code>resolve_event_by_host</code> still pinned to the legacy{" "}
              <code>.getstamped.com.au</code> suffix while the primary subdomain resolves on{" "}
              <code>.{PUBLIC_TENANT_ROOT_DOMAIN}</code>.
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
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
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
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Public slug</span>
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
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
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
