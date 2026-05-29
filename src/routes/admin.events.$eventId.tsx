import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/placeholder";
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

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  domains: Domain[];
  terms: TermsVersion | null;
  checkin: CheckinSettings | null;
  leaderboard: LeaderboardSettings | null;
  venues: Venue[];
  qrByVenue: Map<string, QrSummary>;
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

type BrandEditForm = {
  primary_color: string;
  accent_color: string;
  font_family: string;
  welcome_copy: string;
  terms_url: string;
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

  const [isEditingBranding, setIsEditingBranding] = useState(false);
  const [brandForm, setBrandForm] = useState<BrandEditForm | null>(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandSaveError, setBrandSaveError] = useState<string | null>(null);
  const [brandValidationError, setBrandValidationError] = useState<string | null>(null);

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
      const [brandingRes, domainsRes, checkinRes, leaderboardRes, venuesRes, termsRes] =
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

  function startEditBranding() {
    if (!bundle) return;
    setBrandForm({
      primary_color: bundle.branding?.primary_color ?? "",
      accent_color: bundle.branding?.accent_color ?? "",
      font_family: bundle.branding?.font_family ?? "",
      welcome_copy: bundle.branding?.welcome_copy ?? "",
      terms_url: bundle.branding?.terms_url ?? "",
    });
    setBrandValidationError(null);
    setBrandSaveError(null);
    setIsEditingBranding(true);
  }

  function cancelEditBranding() {
    setIsEditingBranding(false);
    setBrandForm(null);
    setBrandValidationError(null);
    setBrandSaveError(null);
  }

  async function saveEditBranding() {
    if (!brandForm || !agencyId || !bundle) return;

    const primaryColor = brandForm.primary_color.trim();
    const accentColor = brandForm.accent_color.trim();
    const fontFamily = brandForm.font_family.trim();
    const welcomeCopy = brandForm.welcome_copy.trim();
    const termsUrl = brandForm.terms_url.trim();

    const hexRe = /^#[0-9A-Fa-f]{6}$/;
    if (primaryColor && !hexRe.test(primaryColor)) {
      setBrandValidationError("Primary colour must be a valid 6-digit hex code (e.g. #7A1F2B).");
      return;
    }
    if (accentColor && !hexRe.test(accentColor)) {
      setBrandValidationError("Accent colour must be a valid 6-digit hex code (e.g. #E8C547).");
      return;
    }
    if (fontFamily.length > 100) {
      setBrandValidationError("Font family must be 100 characters or fewer.");
      return;
    }
    if (welcomeCopy.length > 1000) {
      setBrandValidationError("Welcome copy must be 1000 characters or fewer.");
      return;
    }
    if (termsUrl && !termsUrl.startsWith("https://")) {
      setBrandValidationError("Terms URL must start with https://.");
      return;
    }

    setBrandValidationError(null);
    setBrandSaveError(null);
    setBrandSaving(true);

    let error: { message: string } | null = null;
    if (bundle.branding) {
      const { error: upErr } = await supabase
        .from("event_branding")
        .update({
          primary_color: primaryColor || null,
          accent_color: accentColor || null,
          font_family: fontFamily || null,
          welcome_copy: welcomeCopy || null,
          terms_url: termsUrl || null,
        })
        .eq("event_id", eventId)
        .eq("agency_id", agencyId);
      error = upErr ?? null;
    } else {
      const { error: inErr } = await supabase
        .from("event_branding")
        .insert({
          agency_id: agencyId,
          event_id: eventId,
          primary_color: primaryColor || null,
          accent_color: accentColor || null,
          font_family: fontFamily || null,
          welcome_copy: welcomeCopy || null,
          terms_url: termsUrl || null,
        });
      error = inErr ?? null;
    }

    setBrandSaving(false);
    if (error) {
      setBrandSaveError("Could not save branding changes. Please try again.");
      return;
    }
    setIsEditingBranding(false);
    setBrandForm(null);
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

  const { event, branding, domains, terms, checkin, leaderboard, venues, qrByVenue } = bundle;

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
          ) : canEdit ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              Edit basics
            </button>
          ) : null
        }
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
            {isEditingBranding && brandForm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditBranding}
                    disabled={brandSaving}
                    className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditBranding}
                    disabled={brandSaving}
                    className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {brandSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                {(brandValidationError || brandSaveError) && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {brandValidationError ?? brandSaveError}
                  </div>
                )}
                <Field label="Logo path">
                  <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    {branding?.logo_path ?? "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">Logo upload is not enabled yet.</p>
                </Field>
                <Field label="Cover path">
                  <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    {branding?.cover_path ?? "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">Cover upload is not enabled yet.</p>
                </Field>
                <Field label="Primary colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandForm.primary_color || "#000000"}
                      onChange={(e) => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                      className="h-9 w-12 rounded-md border bg-background"
                    />
                    <input
                      type="text"
                      value={brandForm.primary_color}
                      onChange={(e) => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                      placeholder="#7A1F2B"
                      className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono"
                      maxLength={7}
                    />
                  </div>
                </Field>
                <Field label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandForm.accent_color || "#000000"}
                      onChange={(e) => setBrandForm({ ...brandForm, accent_color: e.target.value })}
                      className="h-9 w-12 rounded-md border bg-background"
                    />
                    <input
                      type="text"
                      value={brandForm.accent_color}
                      onChange={(e) => setBrandForm({ ...brandForm, accent_color: e.target.value })}
                      placeholder="#E8C547"
                      className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono"
                      maxLength={7}
                    />
                  </div>
                </Field>
                <Field label="Font family">
                  <input
                    type="text"
                    value={brandForm.font_family}
                    onChange={(e) => setBrandForm({ ...brandForm, font_family: e.target.value })}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    maxLength={100}
                  />
                </Field>
                <Field label="Welcome copy">
                  <textarea
                    value={brandForm.welcome_copy}
                    onChange={(e) => setBrandForm({ ...brandForm, welcome_copy: e.target.value })}
                    className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
                    maxLength={1000}
                  />
                </Field>
                <Field label="Terms URL (branding)">
                  <input
                    type="text"
                    value={brandForm.terms_url}
                    onChange={(e) => setBrandForm({ ...brandForm, terms_url: e.target.value })}
                    placeholder="https://…"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  />
                </Field>
              </div>
            ) : (
              <>
                {canEdit && (
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={startEditBranding}
                      className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
                    >
                      Edit branding
                    </button>
                  </div>
                )}
                {branding ? (
                  <DefList
                    rows={[
                      ["Logo path", branding.logo_path ?? "—"],
                      ["Cover path", branding.cover_path ?? "—"],
                      ["Primary colour", <ColorSwatch key="p" value={branding.primary_color} />],
                      ["Accent colour", <ColorSwatch key="a" value={branding.accent_color} />],
                      ["Font family", branding.font_family ?? "—"],
                      ["Welcome copy", branding.welcome_copy ?? "—"],
                      ["Terms URL (branding)", branding.terms_url ?? "—"],
                    ]}
                  />
                ) : (
                  <EmptyNotice>No branding configured yet.</EmptyNotice>
                )}
              </>
            )}
          </Section>

          <Section title="Domains">
            {domains.length === 0 ? (
              <EmptyNotice>No domain configured yet.</EmptyNotice>
            ) : (
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
                    {domains.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2">{d.public_subdomain ?? "—"}</td>
                        <td className="px-3 py-2">{d.custom_domain ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.domain_type}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{d.status}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{d.is_primary ? "yes" : "no"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmt(d.verified_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Venues">
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
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((v) => {
                      const qr = qrByVenue.get(v.id);
                      return (
                        <tr key={v.id} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{v.order_index}</td>
                          <td className="px-3 py-2 font-medium">{v.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{v.address ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{v.status}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {qr ? qr.status : "none"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmt(qr?.issued_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  QR tokens are hidden. Reveal/copy and poster download will be added behind an
                  admin-only control later.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
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

