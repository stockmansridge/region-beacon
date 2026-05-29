import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/placeholder";
import { QrPreview } from "@/components/qr-preview";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

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
  terms_version: string;
  terms_url: string;
  privacy_version: string;
  privacy_url: string;
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
};

type QrSummary = {
  venue_id: string;
  status: string;
  issued_at: string;
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
  const agencyId = agency.selected?.id ?? null;
  const canEdit =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

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
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueSaveError, setVenueSaveError] = useState<string | null>(null);
  const [venueValidationError, setVenueValidationError] = useState<string | null>(null);
  const [venueArchivingId, setVenueArchivingId] = useState<string | null>(null);
  const [venueArchiveError, setVenueArchiveError] = useState<string | null>(null);

  // QR controls — token is fetched only on explicit reveal/rotate and held in
  // memory only. Map: venue_id -> revealed token.
  const [revealedQrByVenue, setRevealedQrByVenue] = useState<Map<string, string>>(new Map());
  const [qrActionVenueId, setQrActionVenueId] = useState<string | null>(null);
  const [qrActionError, setQrActionError] = useState<string | null>(null);
  const [qrCopiedVenueId, setQrCopiedVenueId] = useState<string | null>(null);

  useEffect(() => {

    if (!agencyId || eventId === "new") {
      if (eventId === "new") setState("not-found");
      return;
    }
    let cancelled = false;
    setState("loading");

    (async () => {
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
        setState("error");
        return;
      }
      if (!event) {
        setState("not-found");
        return;
      }

      // 2. Fetch related rows in parallel, each filtered by both event_id AND agency_id.
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
            .select("id, name, address, lat, lng, status, order_index")
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .is("deleted_at", null)
            .order("order_index", { ascending: true }),
          event.current_terms_version_id
            ? supabase
                .from("event_terms_versions")
                .select("id, terms_version, terms_url, privacy_version, privacy_url, effective_at")
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
      if (
        brandingRes.error ||
        domainsRes.error ||
        checkinRes.error ||
        leaderboardRes.error ||
        venuesRes.error ||
        termsRes.error
      ) {
        setState("error");
        return;
      }

      const venues = (venuesRes.data ?? []) as Venue[];

      // 3. Fetch active QR codes for these venues — status + issued_at only.
      const qrByVenue = new Map<string, QrSummary>();
      if (venues.length > 0) {
        const { data: qrRows, error: qrErr } = await supabase
          .from("venue_qr_codes")
          .select("venue_id, status, issued_at")
          .eq("agency_id", agencyId)
          .eq("event_id", event.id)
          .eq("status", "active")
          .in("venue_id", venues.map((v) => v.id));

        if (cancelled) return;
        if (qrErr) {
          setState("error");
          return;
        }
        for (const row of (qrRows ?? []) as QrSummary[]) {
          // First active per venue (a partial unique index guarantees uniqueness anyway).
          if (!qrByVenue.has(row.venue_id)) qrByVenue.set(row.venue_id, row);
        }
      }

      setBundle({
        event: event as EventRow,
        branding: (brandingRes.data ?? null) as Branding | null,
        domains: (domainsRes.data ?? []) as Domain[],
        terms: (termsRes.data ?? null) as TermsVersion | null,
        checkin: (checkinRes.data ?? null) as CheckinSettings | null,
        leaderboard: (leaderboardRes.data ?? null) as LeaderboardSettings | null,
        venues,
        qrByVenue,
        activation: activationRes.error ? null : ((activationRes.data ?? null) as Activation | null),
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId, eventId, reloadKey]);

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
    });
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
    });
    setVenueValidationError(null);
    setVenueSaveError(null);
    setVenueEditingId(v.id);
  }

  function cancelVenueEdit() {
    setVenueEditingId(null);
    setVenueForm(null);
    setVenueValidationError(null);
    setVenueSaveError(null);
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

    setVenueValidationError(null);
    setVenueSaveError(null);
    setVenueSaving(true);

    let error: { message: string } | null = null;
    if (venueEditingId === "new") {
      const { error: inErr } = await supabase.from("venues").insert({
        agency_id: agencyId,
        event_id: eventId,
        name,
        address,
        lat,
        lng,
        order_index: orderIndex,
        status: venueForm.status,
      });
      error = inErr ?? null;
    } else {
      const { error: upErr } = await supabase
        .from("venues")
        .update({
          name,
          address,
          lat,
          lng,
          order_index: orderIndex,
          status: venueForm.status,
        })
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
    setVenueEditingId(null);
    setVenueForm(null);
    setReloadKey((k) => k + 1);
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

  /**
   * Build the check-in URL for a QR token.
   * Prefers the event's active public_subdomain domain. Falls back to the
   * in-app /demo/checkin/$venueId route in staging/preview.
   */
  function buildCheckinUrl(token: string): { url: string; isFallback: boolean } {
    const sub = (bundle?.domains ?? []).find(
      (d) =>
        d.domain_type === "event_subdomain" &&
        d.status === "active" &&
        !!d.public_subdomain,
    );
    if (sub?.public_subdomain) {
      return {
        url: `https://${sub.public_subdomain}.getstamped.com.au/checkin/${token}`,
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
    setQrActionVenueId(venueId);
    const { error } = await supabase.rpc("rotate_venue_qr", { _venue_id: venueId });
    setQrActionVenueId(null);
    if (error) {
      // Do not leak raw Supabase errors to the UI.
      setQrActionError(
        isRotate
          ? "Could not rotate QR. Please try again."
          : "Could not generate QR. Please try again.",
      );
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
          This event does not exist for your agency, or you do not have access to it.{" "}
          <Link to="/admin/events" className="font-medium text-primary hover:underline">
            Back to events
          </Link>
          .
        </EmptyNotice>
      </>
    );
  }

  if (state === "error" || !bundle) {
    return (
      <>
        <PageHeader title="Event detail" description="" />
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load event detail.
        </div>
      </>
    );
  }

  const { event, branding, domains, terms, checkin, leaderboard, venues, qrByVenue, activation } = bundle;

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
            </div>
          )
        }

      />

      <EventSetupWarnings
        status={event.status}
        domains={domains}
        hasTerms={!!terms}
      />

      <GoLivePanel
        agencyId={agencyId}
        eventId={event.id}
        eventStatus={event.status}
        domains={domains}
        activation={activation}
        isPlatformAdmin={agency.isPlatformAdmin}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

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


          <Section title="Branding">
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


          <Section title="Public address">
            <PublicAddressCard
              agencyId={agencyId}
              eventId={event.id}
              publicSlug={event.public_slug}
              domains={domains}
              canEdit={canEdit}
              isPlatformAdmin={agency.isPlatformAdmin}
              onChanged={() => setReloadKey((k) => k + 1)}
            />
          </Section>


          <Section
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
              <div className="mb-4 space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">
                    {venueEditingId === "new" ? "New venue" : "Edit venue"}
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
                <Field label="Name" required>
                  <input
                    type="text"
                    maxLength={150}
                    value={venueForm.name}
                    onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  />
                </Field>
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
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 text-xs font-medium text-muted-foreground"
                  >
                    <span aria-hidden></span>
                    Select from Apple Maps
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      Soon
                    </span>
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Coming soon — search for a place, choose it on Apple Maps, or drop a pin to
                    auto-fill the address and coordinates.
                  </p>
                </div>
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
                <details className="rounded-md border bg-background/50">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    Advanced coordinates
                  </summary>
                  <div className="space-y-3 border-t px-3 py-3">
                    <p className="text-xs text-muted-foreground">
                      Coordinates will normally be filled from Apple Maps. Use these only if you
                      need to enter them manually.
                    </p>
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
                  </div>
                </details>
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
                        <tr key={v.id} className="border-t align-top">
                          <td className="px-3 py-2 text-muted-foreground">{v.order_index}</td>
                          <td className="px-3 py-2 font-medium">{v.name}</td>
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
                            <td className="px-3 py-2">
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
                                        downloadName={`qr-${v.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || v.id}`}
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
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditVenue(v)}
                                  disabled={venueEditingId !== null || venueArchivingId !== null}
                                  className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                                >
                                  Edit
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
                  <p className="border-t bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {qrActionError}
                  </p>
                )}
                <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {canEdit
                    ? "Rotating a QR invalidates the previous code immediately. Visitor redemption and poster downloads are not wired yet."
                    : "QR controls are restricted to agency owners and admins."}
                </p>
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title="Terms & privacy">
            {terms ? (
              <DefList
                rows={[
                  ["Terms version", terms.terms_version],
                  ["Terms URL", terms.terms_url],
                  ["Privacy version", terms.privacy_version],
                  ["Privacy URL", terms.privacy_url],
                  ["Effective at", fmt(terms.effective_at)],
                ]}
              />
            ) : (
              <EmptyNotice>No terms version linked.</EmptyNotice>
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

          <Section title="Leaderboard">
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
                {canEdit && (
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={startEditLeaderboard}
                      className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
                    >
                      Edit leaderboard settings
                    </button>
                  </div>
                )}
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
        </aside>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6">
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

function EventSetupWarnings({
  status,
  domains,
  hasTerms,
}: {
  status: string;
  domains: Domain[];
  hasTerms: boolean;
}) {
  const hasActiveSubdomain = domains.some(
    (d) => d.domain_type === "event_subdomain" && d.status === "active",
  );
  const hasPendingSubdomain = domains.some(
    (d) => d.domain_type === "event_subdomain" && d.status === "pending",
  );

  const items: { tone: "warn" | "info"; title: string; body: string }[] = [];

  if (status === "draft") {
    items.push({
      tone: "info",
      title: "Event is a draft",
      body: "Drafts are previewable inside admin only. Visitors can't reach this event yet.",
    });
  }

  if (hasActiveSubdomain) {
    items.push({
      tone: "info",
      title: "Public address active",
      body: "This event's subdomain is active.",
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
    });
  }


  if (!hasTerms) {
    items.push({
      tone: "warn",
      title: "Terms & privacy not configured",
      body: "Add a terms version before publishing — visitors will need to accept it on first sign-up.",
    });
  }

  items.push({
    tone: "info",
    title: "Billing activation not configured",
    body: "Per-event billing/activation will be wired in a later step. This event won't go live publicly until it's activated.",
  });

  if (items.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {items.map((it, i) => (
        <div
          key={i}
          className={
            it.tone === "warn"
              ? "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
              : "rounded-md border bg-muted/40 px-3 py-2 text-sm"
          }
        >
          <div className="font-medium">{it.title}</div>
          <div className="text-muted-foreground">{it.body}</div>
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

function PublicAddressCard({
  agencyId,
  eventId,
  publicSlug,
  domains,
  canEdit,
  isPlatformAdmin,
  onChanged,
}: {
  agencyId: string | null;
  eventId: string;
  publicSlug: string | null;
  domains: Domain[];
  canEdit: boolean;
  isPlatformAdmin: boolean;
  onChanged: () => void;
}) {
  const subdomainRow = domains.find((d) => d.domain_type === "event_subdomain") ?? null;
  const otherDomains = domains.filter((d) => d.domain_type !== "event_subdomain");

  const [input, setInput] = useState("");
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
    ? `${normalized}.getstamped.com.au`
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
              ? `${subdomainRow.public_subdomain}.getstamped.com.au`
              : "—"}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Status</span>
          <span>
            <StatusPill status={subdomainRow?.status ?? "not_claimed"} />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pick a friendly web address for your event on <span className="font-mono">getstamped.com.au</span>.
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
              .getstamped.com.au
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
    ? `https://${primarySubdomain.public_subdomain}.getstamped.com.au`
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
            Simulates {primarySubdomain.public_subdomain}.getstamped.com.au. Only
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
