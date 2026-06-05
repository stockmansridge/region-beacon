import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { TrailLanding } from "@/components/trail-landing";
import {
  DEFAULT_VENUE_LABEL_PLURAL,
  DEFAULT_VENUE_LABEL_SINGULAR,
  VENUE_LABEL_MAX,
  resolveVenueLabels,
  validateVenueLabel,
} from "@/lib/venue-labels";
import {
  EVENT_ASSET_ALLOWED_MIME,
  EVENT_ASSET_MAX_BYTES,
  deleteEventAssetSafely,
  getEventAssetPublicUrl,
  uploadEventAsset,
  type EventAssetKind,
} from "@/lib/event-assets";
import {
  EVENT_PALETTES,
  type EventPaletteKey,
  getPalette,
  getPaletteOrDefault,
  buildCustomPalette,
} from "@/lib/event-palettes";
import {
  EVENT_BACKGROUNDS,
  type EventBackgroundKey,
  getBackground,
} from "@/lib/event-backgrounds";
import { EventPaletteScope } from "@/components/event-palette-scope";

export const Route = createFileRoute("/admin/events/$eventId_/branding")({
  head: () => ({ meta: [{ title: "Edit customer landing page" }] }),
  component: BrandingEditor,
  codeSplitGroupings: [],
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  public_slug: string | null;
  status: string;
};

type Branding = {
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
  venue_label_singular: string | null;
  venue_label_plural: string | null;
  palette_key: string | null;
  page_background_key: string | null;
  page_background_color: string | null;
  card_background_color: string | null;
};

type Domain = {
  public_subdomain: string | null;
  custom_domain: string | null;
  domain_type: string;
  status: string;
  is_primary: boolean;
};

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  domains: Domain[];
  venueCount: number;
  hasBranding: boolean;
};

type Form = {
  primary_color: string;
  accent_color: string;
  font_family: string;
  welcome_copy: string;
  terms_url: string;
  venue_label_singular: string;
  venue_label_plural: string;
  palette_key: string;
  page_background_key: string;
  page_background_color: string;
  card_background_color: string;
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function BrandingEditor() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const canEdit =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<Form>({
    primary_color: "",
    accent_color: "",
    font_family: "",
    welcome_copy: "",
    terms_url: "",
    venue_label_singular: DEFAULT_VENUE_LABEL_SINGULAR,
    venue_label_plural: DEFAULT_VENUE_LABEL_PLURAL,
    palette_key: "",
    page_background_key: "",
    page_background_color: "",
    card_background_color: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (agency.status === "loading") return;
    if (!agencyId) {
      setState("error");
      return;
    }

    let cancelled = false;
    setState("loading");
    (async () => {
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select("id, agency_id, name, public_slug, status")
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

      const [brandingRes, domainsRes, venuesRes] = await Promise.all([
        supabase
          .from("event_branding")
          .select("logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url, venue_label_singular, venue_label_plural, palette_key, page_background_key, page_background_color, card_background_color")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .maybeSingle(),
        supabase
          .from("event_domains")
          .select("public_subdomain, custom_domain, domain_type, status, is_primary")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .order("is_primary", { ascending: false }),
        supabase
          .from("venues")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .eq("status", "active"),
      ]);

      if (cancelled) return;
      if (brandingRes.error || domainsRes.error || venuesRes.error) {
        setState("error");
        return;
      }

      const branding = (brandingRes.data ?? null) as Branding | null;
      setBundle({
        event: event as EventRow,
        branding,
        domains: (domainsRes.data ?? []) as Domain[],
        venueCount: venuesRes.count ?? 0,
        hasBranding: Boolean(brandingRes.data),
      });
      setForm({
        primary_color: branding?.primary_color ?? "",
        accent_color: branding?.accent_color ?? "",
        font_family: branding?.font_family ?? "",
        welcome_copy: branding?.welcome_copy ?? "",
        terms_url: branding?.terms_url ?? "",
        venue_label_singular: branding?.venue_label_singular ?? DEFAULT_VENUE_LABEL_SINGULAR,
        venue_label_plural: branding?.venue_label_plural ?? DEFAULT_VENUE_LABEL_PLURAL,
        palette_key: branding?.palette_key ?? "",
        page_background_key: branding?.page_background_key ?? "",
        page_background_color: branding?.page_background_color ?? "",
        card_background_color: branding?.card_background_color ?? "",
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, agencyId, eventId, reloadKey]);

  async function onSave(opts?: { returnAfter?: boolean }) {
    if (!bundle || !agencyId || !canEdit) return;

    const primary_color = form.primary_color.trim();
    const accent_color = form.accent_color.trim();
    const font_family = form.font_family.trim();
    const welcome_copy = form.welcome_copy.trim();
    const terms_url = normalizeWebsiteUrl(form.terms_url) ?? "";
    const venue_label_singular = form.venue_label_singular.trim();
    const venue_label_plural = form.venue_label_plural.trim();

    if (primary_color && !HEX_RE.test(primary_color)) {
      setValidationError("Primary colour must be a valid 6-digit hex code (e.g. #7A1F2B).");
      return;
    }
    if (accent_color && !HEX_RE.test(accent_color)) {
      setValidationError("Accent colour must be a valid 6-digit hex code (e.g. #E8C547).");
      return;
    }
    if (font_family.length > 100) {
      setValidationError("Font family must be 100 characters or fewer.");
      return;
    }
    if (welcome_copy.length > 1000) {
      setValidationError("Welcome copy must be 1000 characters or fewer.");
      return;
    }
    if (terms_url && !terms_url.startsWith("https://")) {
      setValidationError("Terms URL must start with https://.");
      return;
    }
    const singularErr = validateVenueLabel(venue_label_singular, "Singular venue label");
    if (singularErr) {
      setValidationError(singularErr);
      return;
    }
    const pluralErr = validateVenueLabel(venue_label_plural, "Plural venue label");
    if (pluralErr) {
      setValidationError(pluralErr);
      return;
    }

    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);

    const palette_key = form.palette_key.trim();
    const page_background_key = form.page_background_key.trim();
    const page_background_color = form.page_background_color.trim();
    const card_background_color = form.card_background_color.trim();

    if (page_background_color && !HEX_RE.test(page_background_color)) {
      setSaving(false);
      setValidationError("Custom page background must be a valid 6-digit hex code (e.g. #F6EFE2).");
      return;
    }
    if (card_background_color && !HEX_RE.test(card_background_color)) {
      setSaving(false);
      setValidationError("Custom card background must be a valid 6-digit hex code.");
      return;
    }

    const fullPayload: Record<string, unknown> = {
      primary_color: primary_color || null,
      accent_color: accent_color || null,
      font_family: font_family || null,
      welcome_copy: welcome_copy || null,
      terms_url: terms_url || null,
      venue_label_singular,
      venue_label_plural,
      palette_key: palette_key || null,
      page_background_key: page_background_key || null,
      page_background_color: page_background_color || null,
      card_background_color: card_background_color || null,
    };

    const SELECT_COLS =
      "logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url, venue_label_singular, venue_label_plural, palette_key, page_background_key, page_background_color, card_background_color";

    // 1. Re-check existence from the DB (don't rely on stale bundle.hasBranding).
    const { data: existing, error: existingErr } = await supabase
      .from("event_branding")
      .select("event_id, agency_id")
      .eq("event_id", bundle.event.id)
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (existingErr) {
      // eslint-disable-next-line no-console
      console.warn("[branding-save] precheck failed", {
        code: existingErr.code,
        message: existingErr.message,
      });
    }


    async function writeRow(payload: Record<string, unknown>, mode: "update" | "insert") {
      if (!bundle) return { row: null, error: { message: "Internal error." } as any };
      if (mode === "update") {
        const { data, error } = await supabase
          .from("event_branding")
          .update(payload)
          .eq("event_id", bundle.event.id)
          .eq("agency_id", agencyId!)
          .select(SELECT_COLS)
          .maybeSingle();
        return { row: data, error };
      }
      const { data, error } = await supabase
        .from("event_branding")
        .insert({ agency_id: agencyId!, event_id: bundle.event.id, ...payload })
        .select(SELECT_COLS)
        .maybeSingle();
      return { row: data, error };
    }

    const mode: "update" | "insert" = existing ? "update" : "insert";
    let payload = fullPayload;
    let { row: savedRow, error: writeErr } = await writeRow(payload, mode);

    // Fallback if custom background columns are missing on the production DB
    // (migration 03 not yet applied). Retry without those keys so the rest persists.
    if (
      writeErr &&
      /(page_background_color|card_background_color)/i.test(writeErr.message ?? "")
    ) {
      console.warn("[branding-save] custom-background columns missing, retrying without", {
        message: writeErr.message,
      });
      const { page_background_color: _pbc, card_background_color: _cbc, ...rest } = fullPayload;
      payload = rest;
      const retry = await writeRow(payload, mode);
      savedRow = retry.row;
      writeErr = retry.error;
      if (!writeErr && (page_background_color || card_background_color)) {
        setSaveError(
          "Saved core branding. Custom hex background colours require the database migration in supabase/migrations-draft-event-background/03_custom_background_colors.sql.",
        );
      }
    }

    if (writeErr) {
      // eslint-disable-next-line no-console
      console.warn("[branding-save] write failed", {
        mode,
        code: (writeErr as any)?.code ?? null,
        message: writeErr.message ?? null,
      });
    }


    if (writeErr) {
      setSaving(false);
      setSaveError("Branding could not be saved. Please try again or contact support.");
      return;
    }

    if (!savedRow) {
      // Update returned no rows — likely an RLS / scope mismatch.
      setSaving(false);
      setSaveError(
        "Branding could not be saved (no row affected). Please reload the page and try again.",
      );
      return;
    }

    // Reload local state from the verified saved row, not from the form.
    const saved = savedRow as Branding;
    setBundle((b) =>
      b ? { ...b, branding: saved, hasBranding: true } : b,
    );
    setForm({
      primary_color: saved.primary_color ?? "",
      accent_color: saved.accent_color ?? "",
      font_family: saved.font_family ?? "",
      welcome_copy: saved.welcome_copy ?? "",
      terms_url: saved.terms_url ?? "",
      venue_label_singular: saved.venue_label_singular ?? DEFAULT_VENUE_LABEL_SINGULAR,
      venue_label_plural: saved.venue_label_plural ?? DEFAULT_VENUE_LABEL_PLURAL,
      palette_key: saved.palette_key ?? "",
      page_background_key: saved.page_background_key ?? "",
      page_background_color: saved.page_background_color ?? "",
      card_background_color: saved.card_background_color ?? "",
    });

    setSaving(false);
    if (!saveError) setSaveSuccess("Branding saved.");

    if (opts?.returnAfter) {
      navigate({ to: "/admin/events/$eventId", params: { eventId } });
    }
  }

  async function persistAssetPath(
    kind: EventAssetKind,
    newPath: string,
    previousPath: string | null,
  ): Promise<string | null> {
    if (!bundle || !agencyId) return "Internal error.";
    const column = kind === "logo" ? "logo_path" : "cover_path";
    const payload = { [column]: newPath } as Record<string, string>;

    let error: { message: string } | null = null;
    if (bundle.hasBranding) {
      const { error: upErr } = await supabase
        .from("event_branding")
        .update(payload)
        .eq("event_id", bundle.event.id)
        .eq("agency_id", agencyId);
      error = upErr ?? null;
    } else {
      const { error: inErr } = await supabase
        .from("event_branding")
        .insert({
          agency_id: agencyId,
          event_id: bundle.event.id,
          ...payload,
        });
      error = inErr ?? null;
    }
    if (error) {
      // Roll back the orphan upload so storage doesn't keep an unreferenced file.
      await deleteEventAssetSafely(newPath);
      return "Saved the file but could not update the event record.";
    }
    // Best-effort: remove the previous object now that the DB is pointing
    // at the new one.
    if (previousPath && previousPath !== newPath) {
      await deleteEventAssetSafely(previousPath);
    }
    setReloadKey((k) => k + 1);
    return null;
  }

  async function removeAsset(
    kind: EventAssetKind,
    currentPath: string | null,
  ): Promise<string | null> {
    if (!bundle || !agencyId || !canEdit) return "You do not have permission to remove this.";
    if (!currentPath) return null;
    const column = kind === "logo" ? "logo_path" : "cover_path";
    const { error } = await supabase
      .from("event_branding")
      .update({ [column]: null })
      .eq("event_id", bundle.event.id)
      .eq("agency_id", agencyId);
    if (error) {
      return kind === "logo"
        ? "Could not remove the logo. Please try again."
        : "Could not remove the cover image. Please try again.";
    }
    await deleteEventAssetSafely(currentPath);
    setReloadKey((k) => k + 1);
    return null;
  }


  function onCancel() {
    navigate({ to: "/admin/events/$eventId", params: { eventId } });
  }

  const primaryDomain = useMemo(
    () => bundle?.domains.find((d) => d.is_primary) ?? bundle?.domains[0] ?? null,
    [bundle],
  );

  if (agency.status === "loading" || state === "loading") {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (state === "not-found") {
    return (
      <div className="p-6">
        <PageHeader title="Event not found" />
        <Link to="/admin/events" className="text-sm text-primary underline">
          Back to events
        </Link>
      </div>
    );
  }
  if (state === "error" || !bundle) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load this event. Please try again.
      </div>
    );
  }

  const { event, branding, venueCount } = bundle;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#64748B]">
            Customer landing page
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#111827]">{event.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
            <span className="rounded-full border border-[#D9E2EF] bg-white px-2.5 py-0.5">
              Status: {event.status}
            </span>
            <span className="rounded-full border border-[#D9E2EF] bg-white px-2.5 py-0.5">
              Slug: {event.public_slug ?? "—"}
            </span>
            <span className="rounded-full border border-[#D9E2EF] bg-white px-2.5 py-0.5">
              {primaryDomain
                ? `${primaryDomain.public_subdomain ?? primaryDomain.custom_domain ?? "—"} · ${primaryDomain.status}`
                : "No domain configured"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/events/$eventId"
            params={{ eventId }}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
          >
            ← Back to event
          </Link>
          <Link
            to="/admin/events/$eventId/preview"
            params={{ eventId }}
            target="_blank"
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
          >
            Open full preview
          </Link>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
            title="Discard unsaved changes and return to the event"
          >
            Discard changes
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => onSave()}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-[10px] border border-[#2F6FE4] bg-white px-4 text-sm font-semibold text-[#2F6FE4] hover:bg-[#EAF2FF] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => onSave({ returnAfter: true })}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save & return to event"}
              </button>
            </>
          )}
        </div>


      </div>

      {!canEdit && (
        <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#334155]">
          You have view-only access. Only organisation owners, organisation admins, and platform admins can edit branding.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* ============== LEFT: choices ============== */}
        <div className="space-y-5 lg:order-1 order-2">
          {(validationError || saveError) && (
            <div className="rounded-[12px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              {validationError ?? saveError}
            </div>
          )}
          {saveSuccess && !saveError && !validationError && (
            <div className="rounded-[12px] border border-[#86EFAC] bg-[#ECFDF5] px-4 py-3 text-sm text-[#047857]">
              {saveSuccess}
            </div>
          )}

          <PaletteSelector
            value={form.palette_key}
            onChange={(key) => setForm({ ...form, palette_key: key })}
            disabled={!canEdit || saving}
          />

          {/* Custom brand colours — only visible when the Custom palette is selected. */}
          {form.palette_key === "custom" && (
            <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div>
                <div className="text-sm font-semibold">Custom brand colours</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used as the primary button colour and accent across the public pages. Leave blank to fall back to the GetStampd defaults.
                </p>
              </div>
              <Field label="Primary button colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.primary_color) ? form.primary_color : "#1F3D2B"}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    disabled={!canEdit || saving}
                    className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={form.primary_color}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    placeholder="#1F3D2B"
                    disabled={!canEdit || saving}
                    maxLength={7}
                    className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </Field>
              <Field label="Accent colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.accent_color) ? form.accent_color : "#B5572A"}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    disabled={!canEdit || saving}
                    className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={form.accent_color}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    placeholder="#B5572A"
                    disabled={!canEdit || saving}
                    maxLength={7}
                    className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </Field>
            </div>
          )}

          <BackgroundSelector
            value={form.page_background_key}
            paletteKey={form.palette_key}
            primaryColor={form.primary_color}
            accentColor={form.accent_color}
            onChange={(key) => setForm({ ...form, page_background_key: key })}
            disabled={!canEdit || saving}
          />

          {/* Custom background hex inputs — visible when custom_color is selected */}
          {form.page_background_key === "custom_color" && (
            <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div>
                <div className="text-sm font-semibold">Custom background colour</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a hex page background, and optionally a card background.
                  These values are only applied while “Custom colour” is the selected page background.
                </p>
              </div>
              <Field label="Page background colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.page_background_color) ? form.page_background_color : "#FFFFFF"}
                    onChange={(e) => setForm({ ...form, page_background_color: e.target.value })}
                    disabled={!canEdit || saving}
                    className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={form.page_background_color}
                    onChange={(e) => setForm({ ...form, page_background_color: e.target.value })}
                    placeholder="#F6EFE2"
                    disabled={!canEdit || saving}
                    maxLength={7}
                    className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </Field>
              <Field label="Card background colour (optional)">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.card_background_color) ? form.card_background_color : "#FFFFFF"}
                    onChange={(e) => setForm({ ...form, card_background_color: e.target.value })}
                    disabled={!canEdit || saving}
                    className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={form.card_background_color}
                    onChange={(e) => setForm({ ...form, card_background_color: e.target.value })}
                    placeholder="#FBF5E8"
                    disabled={!canEdit || saving}
                    maxLength={7}
                    className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </Field>
            </div>
          )}

          <Field label="Font family">
            <input
              type="text"
              value={form.font_family}
              onChange={(e) => setForm({ ...form, font_family: e.target.value })}
              placeholder="e.g. Inter, system-ui"
              disabled={!canEdit || saving}
              maxLength={100}
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>

          <Field label="Welcome copy">
            <textarea
              value={form.welcome_copy}
              onChange={(e) => setForm({ ...form, welcome_copy: e.target.value })}
              disabled={!canEdit || saving}
              maxLength={1000}
              className="min-h-28 w-full rounded-[10px] border border-[#D9E2EF] bg-white p-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="A short welcome message for your visitors."
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {form.welcome_copy.length}/1000
            </div>
          </Field>

          {/* ============== Customer wording ============== */}
          <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div>
              <div className="text-sm font-semibold">Customer wording</div>
              <p className="mt-1 text-xs text-muted-foreground">
                What do you call the places visitors check in at? Use{" "}
                <span className="font-medium">Wineries</span> for a wine trail,{" "}
                <span className="font-medium">Restaurants</span> for a food festival,{" "}
                <span className="font-medium">Stops</span> for a tourism trail. Defaults to{" "}
                Venue / Venues.
              </p>
            </div>

            <Field label="Singular venue label">
              <input
                type="text"
                value={form.venue_label_singular}
                onChange={(e) => setForm({ ...form, venue_label_singular: e.target.value })}
                placeholder="Venue"
                disabled={!canEdit || saving}
                maxLength={VENUE_LABEL_MAX}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {form.venue_label_singular.length}/{VENUE_LABEL_MAX}
              </div>
            </Field>

            <Field label="Plural venue label">
              <input
                type="text"
                value={form.venue_label_plural}
                onChange={(e) => setForm({ ...form, venue_label_plural: e.target.value })}
                placeholder="Venues"
                disabled={!canEdit || saving}
                maxLength={VENUE_LABEL_MAX}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {form.venue_label_plural.length}/{VENUE_LABEL_MAX}
              </div>
            </Field>
          </div>
        </div>

        {/* ============== RIGHT: sticky preview + uploads ============== */}
        <div className="lg:order-2 order-1 space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[#111827]">Live preview</h3>
                <p className="text-sm leading-6 text-[#64748B]">
                  Preview how the public event page will use this branding.
                </p>
              </div>
            </div>
            <EventPaletteScope
              paletteKey={form.palette_key || null}
              backgroundKey={form.page_background_key || null}
              primaryColor={form.primary_color}
              accentColor={form.accent_color}
              pageBackgroundColor={form.page_background_color}
              cardBackgroundColor={form.card_background_color}
              className="overflow-hidden rounded-[16px] border border-[#E6ECF4] bg-[#F8FAFC] p-4"
            >
              <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: "var(--event-muted, #8A7E66)" }}>
                <span>Customer landing — live preview</span>
                <span>Mobile</span>
              </div>
              <TrailLanding
                eventName={event.name}
                welcomeCopy={form.welcome_copy.trim() || "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail."}
                primaryColor={(() => {
                  const p = getPalette(form.palette_key || null);
                  if (p) return p.primary;
                  return HEX_RE.test(form.primary_color.trim()) ? form.primary_color.trim() : "#1F3D2B";
                })()}
                accentColor={(() => {
                  const p = getPalette(form.palette_key || null);
                  if (p) return p.accent;
                  return HEX_RE.test(form.accent_color.trim()) ? form.accent_color.trim() : "#B5572A";
                })()}
                fontFamily={form.font_family.trim() || undefined}
                venueCount={venueCount}
                venueLabelPlural={resolveVenueLabels({ venue_label_singular: form.venue_label_singular, venue_label_plural: form.venue_label_plural }).plural}
                logoUrl={getEventAssetPublicUrl(branding?.logo_path)}
                heroImageUrl={getEventAssetPublicUrl(branding?.cover_path)}
                badge="Preview"
                termsUrl={null}
              />
            </EventPaletteScope>
          </div>

          <AssetUploader
            kind="logo"
            currentPath={branding?.logo_path ?? null}
            canEdit={canEdit}
            onUpload={async (file) => {
              if (!agencyId) return "Select an organisation before uploading.";
              const res = await uploadEventAsset({
                agencyId,
                eventId: event.id,
                kind: "logo",
                file,
              });
              if (!res.ok) return res.error;
              return persistAssetPath("logo", res.path, branding?.logo_path ?? null);
            }}
            onRemove={() => removeAsset("logo", branding?.logo_path ?? null)}
          />
          <AssetUploader
            kind="cover"
            currentPath={branding?.cover_path ?? null}
            canEdit={canEdit}
            onUpload={async (file) => {
              if (!agencyId) return "Select an organisation before uploading.";
              const res = await uploadEventAsset({
                agencyId,
                eventId: event.id,
                kind: "cover",
                file,
              });
              if (!res.ok) return res.error;
              return persistAssetPath("cover", res.path, branding?.cover_path ?? null);
            }}
            onRemove={() => removeAsset("cover", branding?.cover_path ?? null)}
          />

          {canEdit && (
            <div className="flex flex-wrap gap-2 rounded-[16px] border border-[#D9E2EF] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <button
                type="button"
                onClick={() => onSave()}
                disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] border border-[#2F6FE4] bg-white px-4 text-sm font-semibold text-[#2F6FE4] hover:bg-[#EAF2FF] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => onSave({ returnAfter: true })}
                disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save & return"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#334155]">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-[#334155]">{label}</div>
      <div className="rounded-[10px] border border-[#D9E2EF] bg-[#F8FAFC] px-3 py-2 text-sm text-[#111827]">{children}</div>
    </div>
  );
}

function LandingPreview({
  eventName,
  primaryColor,
  accentColor,
  fontFamily,
  welcomeCopy,
  termsUrl,
  venueCount,
  venueLabelPlural,
  logoUrl,
  heroImageUrl,
}: {
  eventName: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string | undefined;
  welcomeCopy: string;
  termsUrl: string;
  venueCount: number;
  venueLabelPlural: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
}) {
  return (
    <div className="rounded-2xl border border-[#E6DCC7] bg-trail-cream p-4">
      <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
        <span>Customer landing — live preview</span>
        <span>Mobile</span>
      </div>
      <TrailLanding
        eventName={eventName}
        welcomeCopy={
          welcomeCopy ||
          "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail."
        }
        primaryColor={primaryColor}
        accentColor={accentColor}
        fontFamily={fontFamily}
        venueCount={venueCount}
        venueLabelPlural={venueLabelPlural}
        logoUrl={logoUrl}
        heroImageUrl={heroImageUrl}
        badge="Preview"
        termsUrl={termsUrl || null}
      />
    </div>
  );
}

// ============================================================================
// AssetUploader
// ============================================================================

function AssetUploader({
  kind,
  currentPath,
  canEdit,
  onUpload,
  onRemove,
}: {
  kind: EventAssetKind;
  currentPath: string | null;
  canEdit: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = getEventAssetPublicUrl(currentPath);
  const label = kind === "logo" ? "Event logo" : "Cover image";
  const helper =
    kind === "logo"
      ? "Shown in the header of your event page. Square images look best."
      : "Wide hero image shown at the top of your event page.";
  const limitMB = Math.round(EVENT_ASSET_MAX_BYTES[kind] / (1024 * 1024));
  const accept = EVENT_ASSET_ALLOWED_MIME.join(",");
  const disabled = !canEdit || busy || removing;

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    const result = await onUpload(file);
    setBusy(false);
    if (result) setErr(result);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRemove() {
    if (!url) return;
    const ok = window.confirm(
      kind === "logo"
        ? "Remove the event logo? You can upload a new one any time."
        : "Remove the cover image? You can upload a new one any time.",
    );
    if (!ok) return;
    setErr(null);
    setRemoving(true);
    const result = await onRemove();
    setRemoving(false);
    if (result) setErr(result);
  }

  const previewClass =
    kind === "logo"
      ? "h-28 w-28 rounded-[12px]"
      : "aspect-[16/9] w-full rounded-[12px]";

  return (
    <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-base font-semibold text-[#111827]">{label}</div>
        <div className="text-[11px] text-[#64748B]">
          PNG, JPG, WebP · max {limitMB} MB
        </div>
      </div>
      <p className="text-sm leading-6 text-[#64748B]">{helper}</p>

      <div className={`rounded-[16px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 ${url ? "" : "text-center"}`}>
        {url ? (
          <div className={`relative mx-auto flex items-center justify-center overflow-hidden border border-[#E6ECF4] bg-white ${previewClass}`}>
            <img
              src={url}
              alt={kind === "logo" ? "Event logo preview" : "Event cover preview"}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : (
          <>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#EAF2FF] text-[#2F6FE4]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="text-sm font-medium text-[#334155]">
              No {kind === "logo" ? "logo" : "cover image"} uploaded yet
            </div>
            <div className="mt-1 text-xs leading-5 text-[#64748B]">
              {helper}
            </div>
          </>
        )}
      </div>

      {err && (
        <div className="rounded-[12px] border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">{err}</div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Uploading…"
              : url
                ? `Replace ${kind === "logo" ? "logo" : "cover"}`
                : `Upload ${kind === "logo" ? "logo" : "cover"}`}
          </button>
          {url && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="h-10 rounded-[10px] border border-[#FDA4AF] bg-white px-4 text-sm font-semibold text-[#E11D48] hover:bg-[#FFF1F2] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing ? "Removing…" : `Remove ${kind === "logo" ? "logo" : "cover"}`}
            </button>
          )}
        </div>
      )}
      {!canEdit && !url && (
        <div className="text-xs text-[#64748B]">No image uploaded.</div>
      )}
    </div>
  );
}

// ============================================================================
// PaletteSelector
// ============================================================================

function PaletteSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const selected = getPalette(value || null);
  return (
    <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">Colour palette</div>
        {selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick a curated palette to colour the public event pages. When set, the
        palette overrides the primary &amp; accent colours below. Leave unset to
        keep the GetStampd default look (or your own primary/accent hex codes).
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EVENT_PALETTES.map((p) => {
          const active = p.key === value;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key as EventPaletteKey)}
              disabled={disabled}
              className={`flex items-start gap-3 rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span
                  className="block h-5 w-10 rounded"
                  style={{ background: p.primary }}
                  aria-hidden
                />
                <span
                  className="block h-5 w-10 rounded"
                  style={{ background: p.accent }}
                  aria-hidden
                />
                <span
                  className="block h-5 w-10 rounded border"
                  style={{ background: p.pageBg, borderColor: p.border }}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {p.description}
                </div>
              </div>
            </button>
          );
        })}
        {/* Custom palette card */}
        <button
          type="button"
          onClick={() => onChange("custom")}
          disabled={disabled}
          className={`flex items-start gap-3 rounded-lg border p-2 text-left transition disabled:opacity-50 ${
            value === "custom"
              ? "border-primary bg-primary/5 ring-2 ring-primary/30"
              : "border-border hover:bg-muted/40"
          }`}
        >
          <div className="flex h-[68px] w-10 items-center justify-center rounded border text-xl" aria-hidden>
            🎨
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Custom</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Use your own primary &amp; accent hex colours (set below).
            </div>
          </div>
        </button>
      </div>
      {selected && (
        <div
          className="mt-2 rounded-lg p-3 text-xs"
          style={{
            background: selected.cardBg,
            color: selected.bodyText,
            border: `1px solid ${selected.border}`,
          }}
        >
          <div
            className="mb-1 font-semibold"
            style={{ color: selected.heading }}
          >
            {selected.label} preview
          </div>
          <div style={{ color: selected.mutedText }}>
            Sample card · Body text · Muted line
          </div>
          <div className="mt-2 flex gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: selected.primary,
                color: selected.primaryForeground,
              }}
            >
              Primary
            </span>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: selected.accent, color: "#fff" }}
            >
              Accent
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BackgroundSelector
// ============================================================================

function BackgroundSelector({
  value,
  paletteKey,
  primaryColor,
  accentColor,
  onChange,
  disabled,
}: {
  value: string;
  paletteKey: string;
  primaryColor?: string;
  accentColor?: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const palette = (() => {
    if (paletteKey === "custom" || (!paletteKey && (primaryColor || accentColor))) {
      return buildCustomPalette(primaryColor ?? null, accentColor ?? null);
    }
    return getPaletteOrDefault(paletteKey || null);
  })();
  const selected = getBackground(value || null);
  return (
    <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">Page background</div>
        {selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Choose the page background used behind the public event pages. This is
        independent of the colour palette and falls back to a clean light
        background when unset.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EVENT_BACKGROUNDS.map((bg) => {
          const active = bg.key === value;
          return (
            <button
              key={bg.key}
              type="button"
              onClick={() => onChange(bg.key as EventBackgroundKey)}
              disabled={disabled}
              className={`flex items-stretch gap-3 rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <span
                className="block h-14 w-16 flex-shrink-0 rounded border"
                style={bg.swatch(palette)}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{bg.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {bg.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          className="mt-2 rounded-lg p-3 text-xs"
          style={{
            ...selected.build(palette),
            color: palette.bodyText,
            border: `1px solid ${palette.border}`,
          }}
        >
          <div
            className="mb-1 font-semibold"
            style={{ color: palette.heading }}
          >
            {selected.label} preview
          </div>
          <div
            className="rounded p-2"
            style={{ background: palette.cardBg, color: palette.bodyText }}
          >
            Sample card on this background — confirms cards stay readable.
          </div>
        </div>
      )}
    </div>
  );
}



