import { ChevronDown } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { normalizeWebsiteUrl } from "@/lib/normalize-url";
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
  type EventPalette,
  getPalette,
  getPaletteOrDefault,
  buildCustomPalette,
} from "@/lib/event-palettes";
import {
  MODERN_BACKGROUND_STYLES,
  type EventBackgroundKey,
  getBackground,
  getModernStyleKey,
} from "@/lib/event-backgrounds";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { resolveEventTheme } from "@/lib/event-theme";
import { contrastRatio } from "@/lib/contrast";
import {
  EVENT_FONTS,
  buildGoogleFontsHref,
  getEventFont,
  isSupportedEventFont,
} from "@/lib/event-fonts";

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
  text_color: string | null;
  muted_text_color: string | null;
  card_text_color: string | null;
  card_muted_text_color: string | null;
  border_color: string | null;
  primary_text_color: string | null;
  nav_background_color: string | null;
  hero_overlay_color: string | null;
  hero_overlay_opacity: number | null;
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
  text_color: string;
  muted_text_color: string;
  card_text_color: string;
  card_muted_text_color: string;
  border_color: string;
  primary_text_color: string;
  nav_background_color: string;
  hero_overlay_color: string;
  hero_overlay_opacity: string; // empty string = inherit default
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
    text_color: "",
    muted_text_color: "",
    card_text_color: "",
    card_muted_text_color: "",
    border_color: "",
    primary_text_color: "",
    nav_background_color: "",
    hero_overlay_color: "",
    hero_overlay_opacity: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    theme: true,
    customColours: form.palette_key === "custom",
    backgroundStyle: !form.page_background_key,
    textBorder: false,
    heroFade: !(form.hero_overlay_color || form.hero_overlay_opacity),
    fonts: !form.font_family,
    pageContent: !(form.welcome_copy || form.venue_label_singular !== DEFAULT_VENUE_LABEL_SINGULAR),
  });

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

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
          .select("logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url, venue_label_singular, venue_label_plural, palette_key, page_background_key, page_background_color, card_background_color, text_color, muted_text_color, card_text_color, card_muted_text_color, border_color, primary_text_color, nav_background_color, hero_overlay_color, hero_overlay_opacity")
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
        text_color: branding?.text_color ?? "",
        muted_text_color: branding?.muted_text_color ?? "",
        card_text_color: branding?.card_text_color ?? "",
        card_muted_text_color: branding?.card_muted_text_color ?? "",
        border_color: branding?.border_color ?? "",
        primary_text_color: branding?.primary_text_color ?? "",
        nav_background_color: branding?.nav_background_color ?? "",
        hero_overlay_color: branding?.hero_overlay_color ?? "",
        hero_overlay_opacity:
          branding?.hero_overlay_opacity != null
            ? String(branding.hero_overlay_opacity)
            : "",
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, agencyId, eventId, reloadKey]);

  // Dynamically load the selected Google Font so the preview reflects it.
  useEffect(() => {
    // Sync default collapse states when form values change (e.g. switching to custom palette)
    setExpandedSections((prev) => ({
      ...prev,
      customColours: form.palette_key === "custom" ? true : prev.customColours,
    }));
  }, [form.palette_key]);

  useEffect(() => {
    const href = buildGoogleFontsHref([form.font_family]);
    if (!href) return;
    const existing = document.querySelector<HTMLLinkElement>(
      `link[data-event-font="${href}"]`,
    );
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.eventFont = href;
    document.head.appendChild(link);
  }, [form.font_family]);

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
    if (font_family && !isSupportedEventFont(font_family)) {
      setValidationError("Pick a font from the list.");
      return;
    }
    if (welcome_copy.length > 1000) {
      setValidationError("Welcome copy must be 1000 characters or fewer.");
      return;
    }
    // Terms URL is normalised by normalizeWebsiteUrl above.
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
    const text_color = form.text_color.trim();
    const muted_text_color = form.muted_text_color.trim();
    const card_text_color = form.card_text_color.trim();
    const card_muted_text_color = form.card_muted_text_color.trim();
    const border_color = form.border_color.trim();
    const primary_text_color = form.primary_text_color.trim();
    const nav_background_color = form.nav_background_color.trim();
    const hero_overlay_color = form.hero_overlay_color.trim();
    const hero_overlay_opacity_str = form.hero_overlay_opacity.trim();

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
    for (const [label, value] of [
      ["Page text colour", text_color],
      ["Page muted text colour", muted_text_color],
      ["Card text colour", card_text_color],
      ["Card muted text colour", card_muted_text_color],
      ["Border colour", border_color],
      ["Primary button text colour", primary_text_color],
      ["Navigation background colour", nav_background_color],
      ["Hero image overlay colour", hero_overlay_color],
    ] as const) {
      if (value && !HEX_RE.test(value)) {
        setSaving(false);
        setValidationError(`${label} must be a valid 6-digit hex code.`);
        return;
      }
    }
    let hero_overlay_opacity_num: number | null = null;
    if (hero_overlay_opacity_str) {
      const n = Number(hero_overlay_opacity_str);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setSaving(false);
        setValidationError("Hero overlay opacity must be between 0 and 100.");
        return;
      }
      hero_overlay_opacity_num = Math.round(n);
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
      text_color: text_color || null,
      muted_text_color: muted_text_color || null,
      card_text_color: card_text_color || null,
      card_muted_text_color: card_muted_text_color || null,
      border_color: border_color || null,
      primary_text_color: primary_text_color || null,
      nav_background_color: nav_background_color || null,
      hero_overlay_color: hero_overlay_color || null,
      hero_overlay_opacity: hero_overlay_opacity_num,
    };

    const NEW_TEXT_COLS = "text_color, muted_text_color, border_color, primary_text_color";
    const CARD_TEXT_COLS = "card_text_color, card_muted_text_color";
    const NAV_COLS = "nav_background_color";
    const HERO_OVERLAY_COLS = "hero_overlay_color, hero_overlay_opacity";
    const BASE_SELECT_COLS =
      "logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url, venue_label_singular, venue_label_plural, palette_key, page_background_key, page_background_color, card_background_color";
    let SELECT_COLS = `${BASE_SELECT_COLS}, ${NEW_TEXT_COLS}, ${CARD_TEXT_COLS}, ${NAV_COLS}, ${HERO_OVERLAY_COLS}`;

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

    // Fallback if the new card-surface text columns are missing on the
    // production DB. Retry without them so the rest persists.
    if (
      writeErr &&
      /(card_text_color|card_muted_text_color)/i.test(writeErr.message ?? "")
    ) {
      console.warn("[branding-save] card-text columns missing, retrying without", {
        message: writeErr.message,
      });
      const {
        card_text_color: _ctc,
        card_muted_text_color: _cmtc,
        ...rest
      } = payload;
      payload = rest;
      SELECT_COLS = SELECT_COLS.replace(`, ${CARD_TEXT_COLS}`, "");
      const retry = await writeRow(payload, mode);
      savedRow = retry.row;
      writeErr = retry.error;
      if (!writeErr && (card_text_color || card_muted_text_color)) {
        setSaveError(
          "Saved core branding. The new card text/muted colours require the database migration in supabase/migrations-draft-event-card-text-colors/.",
        );
      }
    }

    // Fallback if the new semantic text columns are missing on the
    // production DB (migration `migrations-draft-event-text-colors` not
    // yet applied). Retry without those keys so the rest persists.
    if (
      writeErr &&
      /(text_color|muted_text_color|border_color|primary_text_color)/i.test(writeErr.message ?? "")
    ) {
      console.warn("[branding-save] text-colour columns missing, retrying without", {
        message: writeErr.message,
      });
      const {
        text_color: _tc,
        muted_text_color: _mtc,
        border_color: _bc,
        primary_text_color: _ptc,
        ...rest
      } = fullPayload;
      payload = rest;
      SELECT_COLS = BASE_SELECT_COLS;
      const retry = await writeRow(payload, mode);
      savedRow = retry.row;
      writeErr = retry.error;
      if (!writeErr && (text_color || muted_text_color || border_color || primary_text_color)) {
        setSaveError(
          "Saved core branding. The new semantic text/border colours require the database migration in supabase/migrations-draft-event-text-colors/.",
        );
      }
    }

    // Fallback if custom background columns are missing on the production DB
    // (migration 03 not yet applied). Retry without those keys so the rest persists.
    if (
      writeErr &&
      /(page_background_color|card_background_color)/i.test(writeErr.message ?? "")
    ) {
      console.warn("[branding-save] custom-background columns missing, retrying without", {
        message: writeErr.message,
      });
      const { page_background_color: _pbc, card_background_color: _cbc, ...rest } = payload;
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

    // Fallback if nav_background_color column is missing on the
    // production DB (migration `migrations-draft-event-nav-background`
    // not yet applied). Retry without that key so the rest persists.
    if (
      writeErr &&
      /nav_background_color/i.test(writeErr.message ?? "")
    ) {
      console.warn("[branding-save] nav background column missing, retrying without", {
        message: writeErr.message,
      });
      const { nav_background_color: _nbc, ...rest } = payload;
      payload = rest;
      SELECT_COLS = SELECT_COLS.replace(`, ${NAV_COLS}`, "");
      const retry = await writeRow(payload, mode);
      savedRow = retry.row;
      writeErr = retry.error;
      if (!writeErr && nav_background_color) {
        setSaveError(
          "Saved core branding. The navigation background colour requires the database migration in supabase/migrations-draft-event-nav-background/.",
        );
      }
    }

    // Fallback if hero overlay columns are missing on the production DB
    // (migration `migrations-draft-event-hero-overlay` not yet applied).
    if (
      writeErr &&
      /(hero_overlay_color|hero_overlay_opacity)/i.test(writeErr.message ?? "")
    ) {
      console.warn("[branding-save] hero overlay columns missing, retrying without", {
        message: writeErr.message,
      });
      const { hero_overlay_color: _hoc, hero_overlay_opacity: _hoo, ...rest } = payload;
      payload = rest;
      SELECT_COLS = SELECT_COLS.replace(`, ${HERO_OVERLAY_COLS}`, "");
      const retry = await writeRow(payload, mode);
      savedRow = retry.row;
      writeErr = retry.error;
      if (!writeErr && (hero_overlay_color || hero_overlay_opacity_num !== null)) {
        setSaveError(
          "Saved core branding. Hero overlay colour/opacity require the database migration in supabase/migrations-draft-event-hero-overlay/.",
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
    const saved = savedRow as unknown as Branding;
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
      text_color: saved.text_color ?? text_color ?? "",
      muted_text_color: saved.muted_text_color ?? muted_text_color ?? "",
      card_text_color: saved.card_text_color ?? card_text_color ?? "",
      card_muted_text_color: saved.card_muted_text_color ?? card_muted_text_color ?? "",
      border_color: saved.border_color ?? border_color ?? "",
      primary_text_color: saved.primary_text_color ?? primary_text_color ?? "",
      nav_background_color: saved.nav_background_color ?? nav_background_color ?? "",
      hero_overlay_color: saved.hero_overlay_color ?? hero_overlay_color ?? "",
      hero_overlay_opacity:
        saved.hero_overlay_opacity != null
          ? String(saved.hero_overlay_opacity)
          : hero_overlay_opacity_num != null
            ? String(hero_overlay_opacity_num)
            : "",
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

          <CollapsibleSection
            id="theme"
            title="Theme"
            subtitle={(() => {
              const p = getPalette(form.palette_key || null);
              return p ? p.label : form.palette_key === "custom" ? "Custom" : "None selected";
            })()}
            expanded={expandedSections.theme}
            onToggle={() => toggleSection("theme")}
          >
            <PaletteSelector
              value={form.palette_key}
              onChange={(key) => setForm({ ...form, palette_key: key })}
              onApplyTheme={(p) =>
                setForm((f) => ({
                  ...f,
                  palette_key: "custom",
                  primary_color: p.primary,
                  accent_color: p.accent,
                  page_background_color: p.pageBg,
                  card_background_color: p.cardBg,
                  text_color: p.heading ?? p.bodyText,
                  muted_text_color: p.mutedText,
                  border_color: p.border,
                  primary_text_color: p.primaryForeground,
                  // Default nav background to the palette primary so the
                  // header/bottom nav match by default; the organiser can
                  // override it under Navigation colours.
                  nav_background_color: p.primary,
                  // Switch background mode to honour the custom hex values.
                  page_background_key: "custom_color",
                }))
              }
              disabled={!canEdit || saving}
            />
          </CollapsibleSection>


          {form.palette_key === "custom" && (
            <CollapsibleSection
              id="customColours"
              title="Custom brand & surface colours"
              subtitle={(() => {
                const parts: string[] = [];
                if (form.primary_color) parts.push("Primary");
                if (form.accent_color) parts.push("Accent");
                if (form.page_background_color) parts.push("Page bg");
                if (form.card_background_color) parts.push("Card bg");
                return parts.length ? parts.join(" · ") : "No custom colours set";
              })()}
              expanded={expandedSections.customColours}
              onToggle={() => toggleSection("customColours")}
            >
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
                    Advanced — custom colours
                  </div>
                  <div className="mt-1 text-sm font-semibold">Custom brand &amp; surface colours</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These power the primary button, accent highlights and the
                    page/card surfaces on every public passport page. Click
                    <span className="font-medium"> Apply to custom</span> on any
                    theme above to pre-fill all fields, then change individual
                    colours. Leave a field blank to inherit from the chosen theme.
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

                <Field label="Primary button text colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_RE.test(form.primary_text_color) ? form.primary_text_color : "#FFFFFF"}
                      onChange={(e) => setForm({ ...form, primary_text_color: e.target.value })}
                      disabled={!canEdit || saving}
                      className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={form.primary_text_color}
                      onChange={(e) => setForm({ ...form, primary_text_color: e.target.value })}
                      placeholder="#FFFFFF"
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

                <Field label="Page background colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_RE.test(form.page_background_color) ? form.page_background_color : "#FFFFFF"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          page_background_color: e.target.value,
                          // Ensure custom hex actually paints by switching the
                          // background mode to honour the value.
                          page_background_key: "custom_color",
                        })
                      }
                      disabled={!canEdit || saving}
                      className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={form.page_background_color}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          page_background_color: e.target.value,
                          page_background_key: "custom_color",
                        })
                      }
                      placeholder="#F6EFE2"
                      disabled={!canEdit || saving}
                      maxLength={7}
                      className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </Field>

                <Field label="Card background colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_RE.test(form.card_background_color) ? form.card_background_color : "#FFFFFF"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          card_background_color: e.target.value,
                          page_background_key: "custom_color",
                        })
                      }
                      disabled={!canEdit || saving}
                      className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={form.card_background_color}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          card_background_color: e.target.value,
                          page_background_key: "custom_color",
                        })
                      }
                      placeholder="#FBF5E8"
                      disabled={!canEdit || saving}
                      maxLength={7}
                      className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </Field>

                <p className="text-[11px] text-muted-foreground">
                  Header/navigation and active-nav colours are derived
                  automatically from the primary &amp; accent colours plus the
                  primary-button text colour, so contrast stays readable on
                  dark themes. Card text, muted helper text and borders are
                  edited in the next section.
                </p>
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            id="backgroundStyle"
            title="Background style"
            subtitle={(() => {
              const bg = getBackground(form.page_background_key || null);
              return bg?.label ?? (form.page_background_key === "custom_color" ? "Custom colour" : "Default");
            })()}
            expanded={expandedSections.backgroundStyle}
            onToggle={() => toggleSection("backgroundStyle")}
          >
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
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
                    Advanced — custom colours
                  </div>
                  <div className="mt-1 text-sm font-semibold">Custom background colour</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pick a hex page background, and optionally a card background.
                    These values are only applied while “Custom” is the selected background style.
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
          </CollapsibleSection>

          <CollapsibleSection
            id="textBorder"
            title="Text & border colours"
            subtitle={(() => {
              const parts: string[] = [];
              if (form.text_color) parts.push("Page text");
              if (form.card_text_color) parts.push("Card text");
              if (form.border_color) parts.push("Border");
              if (form.primary_text_color) parts.push("Button text");
              return parts.length ? parts.join(" · ") : "Inheriting from palette";
            })()}
            warningCount={countTextBorderWarnings(form)}
            expanded={expandedSections.textBorder}
            onToggle={() => toggleSection("textBorder")}
          >
            <ColorRolesCard
              form={form}
              setForm={setForm}
              disabled={!canEdit || saving}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="heroFade"
            title="Hero image fade"
            subtitle={(() => {
              if (form.hero_overlay_color && form.hero_overlay_opacity) {
                return `${form.hero_overlay_color} at ${form.hero_overlay_opacity}%`;
              }
              if (form.hero_overlay_color) return form.hero_overlay_color;
              if (form.hero_overlay_opacity) return `${form.hero_overlay_opacity}% opacity`;
              return "Default gradient";
            })()}
            expanded={expandedSections.heroFade}
            onToggle={() => toggleSection("heroFade")}
          >
            <HeroOverlayCard
              form={form}
              setForm={setForm}
              disabled={!canEdit || saving}
            />
          </CollapsibleSection>



          <CollapsibleSection
            id="fonts"
            title="Fonts"
            subtitle={form.font_family ? (getEventFont(form.font_family)?.label ?? form.font_family) : "Default (GetStampd)"}
            expanded={expandedSections.fonts}
            onToggle={() => toggleSection("fonts")}
          >
            <FontPicker
              value={form.font_family}
              onChange={(value) => setForm({ ...form, font_family: value })}
              disabled={!canEdit || saving}
              eventName={event.name}
            />
          </CollapsibleSection>


          <CollapsibleSection
            id="pageContent"
            title="Page content"
            subtitle={(() => {
              const parts: string[] = [];
              if (form.welcome_copy) parts.push("Welcome copy set");
              const labelsCustom =
                form.venue_label_singular !== DEFAULT_VENUE_LABEL_SINGULAR ||
                form.venue_label_plural !== DEFAULT_VENUE_LABEL_PLURAL;
              if (labelsCustom) parts.push("Custom labels");
              return parts.length ? parts.join(" · ") : "Default wording";
            })()}
            expanded={expandedSections.pageContent}
            onToggle={() => toggleSection("pageContent")}
          >
            <div className="space-y-4">
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

              <div className="space-y-3">
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
          </CollapsibleSection>
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
              textColor={form.text_color}
              mutedTextColor={form.muted_text_color}
              cardTextColor={form.card_text_color}
              cardMutedTextColor={form.card_muted_text_color}
              borderColor={form.border_color}
              primaryTextColor={form.primary_text_color}
              navBackgroundColor={form.nav_background_color}
              fontFamily={getEventFont(form.font_family)?.stack ?? (form.font_family.trim() || null)}
              className="overflow-hidden rounded-[16px] border border-[#E6ECF4] bg-[#F8FAFC] p-4"
            >
              <div
                className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--event-muted, #8A7E66)" }}
              >
                <span>Customer landing — live preview</span>
                <span>Mobile</span>
              </div>
              <TrailLanding
                eventName={event.name}
                welcomeCopy={form.welcome_copy.trim() || "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail."}
                primaryColor={(() => {
                  if (HEX_RE.test(form.primary_color.trim())) return form.primary_color.trim();
                  const p = getPalette(form.palette_key || null);
                  if (p) return p.primary;
                  return "#1F3D2B";
                })()}
                accentColor={(() => {
                  if (HEX_RE.test(form.accent_color.trim())) return form.accent_color.trim();
                  const p = getPalette(form.palette_key || null);
                  if (p) return p.accent;
                  return "#B5572A";
                })()}
                fontFamily={getEventFont(form.font_family)?.stack ?? (form.font_family.trim() || undefined)}
                venueCount={venueCount}
                venueLabelPlural={resolveVenueLabels({ venue_label_singular: form.venue_label_singular, venue_label_plural: form.venue_label_plural }).plural}
                logoUrl={getEventAssetPublicUrl(branding?.logo_path)}
                heroImageUrl={getEventAssetPublicUrl(branding?.cover_path)}
                badge="Preview"
                termsUrl={null}
                heroOverlayColor={form.hero_overlay_color || null}
                heroOverlayOpacity={
                  form.hero_overlay_opacity.trim()
                    ? Number(form.hero_overlay_opacity)
                    : null
                }
              />

              <SemanticPreview
                venueLabelPlural={resolveVenueLabels({ venue_label_singular: form.venue_label_singular, venue_label_plural: form.venue_label_plural }).plural}
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
  const recommended =
    kind === "logo"
      ? {
          size: "800 × 800 px (square)",
          note: "Use a transparent PNG for best results.",
        }
      : {
          size: "1600 × 900 px (16:9)",
          note: "PNG or JPG. Avoid important detail near the edges — the top of the image is overlaid with the event title.",
        };
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
      <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] px-3 py-2 text-[11px] leading-5 text-[#475569]">
        <span className="font-semibold text-[#334155]">Recommended size:</span>{" "}
        {recommended.size}
        <span className="block text-[#64748B]">{recommended.note}</span>
      </div>

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
// PaletteSelector — modern mini-preview cards with category filter chips.
// ============================================================================

const PALETTE_FILTERS = [
  { key: "all" as const, label: "All" },
  { key: "minimal" as const, label: "Minimal" },
  { key: "premium" as const, label: "Premium" },
  { key: "bright" as const, label: "Bright" },
  { key: "nature" as const, label: "Nature" },
  { key: "coastal" as const, label: "Coastal" },
  { key: "food_wine" as const, label: "Food & Wine" },
];

function PaletteSelector({
  value,
  onChange,
  onApplyTheme,
  disabled,
}: {
  value: string;
  onChange: (key: string) => void;
  onApplyTheme?: (palette: EventPalette) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState<(typeof PALETTE_FILTERS)[number]["key"]>("all");
  const palettes =
    filter === "all"
      ? EVENT_PALETTES
      : EVENT_PALETTES.filter((p) => p.categories.includes(filter));
  const selected = getPalette(value || null);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold">Theme</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a curated theme as a starting point. Use{" "}
            <span className="font-medium">Apply to custom</span> on any theme to
            copy its full colour set into the editable fields below — you can
            then change any individual colour to build your own brand.
          </p>
        </div>
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

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {PALETTE_FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              disabled={disabled}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                active
                  ? "border-[#2F6FE4] bg-[#EAF2FF] text-[#1F56C5]"
                  : "border-[#D9E2EF] bg-white text-[#475569] hover:bg-[#F8FAFC]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable theme grid — shows ~1.5 rows so users see there's more
          without the editor page becoming excessively tall. */}
      <div
        className="max-h-[280px] overflow-y-auto rounded-[10px] border border-[#EEF2F7] bg-[#FAFBFD] p-2"
        aria-label="Theme presets (scrollable)"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {palettes.map((p) => (
            <PaletteCard
              key={p.key}
              palette={p}
              active={p.key === value}
              disabled={disabled}
              onSelect={() => onChange(p.key as EventPaletteKey)}
              onApply={onApplyTheme ? () => onApplyTheme(p) : undefined}
            />
          ))}

          {/* Custom palette card */}
          <button
            type="button"
            onClick={() => onChange("custom")}
            disabled={disabled}
            className={`group flex flex-col gap-2 rounded-[12px] border p-2 text-left transition disabled:opacity-50 ${
              value === "custom"
                ? "border-[#2F6FE4] ring-2 ring-[#2F6FE4]/30"
                : "border-[#D9E2EF] hover:border-[#94A3B8]"
            }`}
          >
            <div
              className="flex h-[78px] items-center justify-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-2xl"
              aria-hidden
            >
              🎨
            </div>
            <div>
              <div className="text-sm font-semibold text-[#111827]">Custom</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Build your own colour scheme below.
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mini preview card that mimics public-page surfaces. */
function PaletteCard({
  palette: p,
  active,
  disabled,
  onSelect,
  onApply,
}: {
  palette: EventPalette;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onApply?: () => void;
}) {
  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-[12px] border p-2 text-left transition ${
        disabled ? "opacity-50" : ""
      } ${
        active
          ? "border-[#2F6FE4] ring-2 ring-[#2F6FE4]/30"
          : "border-[#D9E2EF] hover:border-[#94A3B8]"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={active}
        className="flex flex-col gap-2 text-left disabled:cursor-not-allowed"
      >
        {/* Mini public-page preview: header strip + card + accent dot + button */}
        <div
          className="overflow-hidden rounded-[8px] border"
          style={{ backgroundColor: p.pageBg, borderColor: p.border }}
        >
          <div
            className="flex h-5 items-center justify-center text-[8px] font-semibold uppercase tracking-[0.18em]"
            style={{ backgroundColor: p.primary, color: p.primaryForeground }}
          >
            Header
          </div>
          <div className="space-y-1.5 p-2">
            <div
              className="rounded-[4px] px-1.5 py-1"
              style={{ backgroundColor: p.cardBg, border: `1px solid ${p.border}` }}
            >
              <div
                className="h-1.5 w-12 rounded-full"
                style={{ backgroundColor: p.heading }}
              />
              <div
                className="mt-1 h-1 w-16 rounded-full"
                style={{ backgroundColor: p.mutedText, opacity: 0.7 }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                style={{ backgroundColor: p.primary, color: p.primaryForeground }}
              >
                Button
              </span>
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: p.accent }}
                aria-hidden
              />
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[#111827]">{p.label}</div>
            {active && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2F6FE4]">
                Selected
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {p.description}
          </div>
          {p.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.tags.slice(0, 3).map((t: string) => (
                <span
                  key={t}
                  className="rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#475569]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
      {onApply && (
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          title="Copy this theme's full colour set into the editable colour fields below. You can then customise any colour."
          className="mt-1 inline-flex h-8 items-center justify-center rounded-[8px] border border-[#D9E2EF] bg-white px-2 text-[11px] font-semibold text-[#1F56C5] hover:bg-[#EAF2FF] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply to custom →
        </button>
      )}
    </div>
  );
}


// ============================================================================
// BackgroundSelector — simplified to 6 palette-driven styles.
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
  // Highlight the modern style that matches the saved key (even if it's
  // a legacy key like `warm_paper`).
  const activeStyleKey = getModernStyleKey(value || null);
  const selectedPalette = getPalette(paletteKey || null);
  const recommendedKey = selectedPalette?.recommendedBackground ?? null;
  const recommended = recommendedKey
    ? MODERN_BACKGROUND_STYLES.find((b) => b.key === recommendedKey)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold">Background style</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Adjusts the public page background. Styles adapt automatically to
            your selected theme.
          </p>
        </div>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {recommended && (
        <div className="rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[11px] leading-5 text-[#1E40AF]">
          Recommended for <span className="font-semibold">{selectedPalette?.label}</span>:{" "}
          <span className="font-semibold">{recommended.label}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MODERN_BACKGROUND_STYLES.map((bg) => {
          const active = bg.key === activeStyleKey;
          const isRecommended = bg.key === recommendedKey;
          return (
            <button
              key={bg.key}
              type="button"
              onClick={() => onChange(bg.key as EventBackgroundKey)}
              disabled={disabled}
              aria-pressed={active}
              className={`group flex flex-col items-stretch gap-1.5 rounded-[12px] border p-2 text-left transition disabled:opacity-50 ${
                active
                  ? "border-[#2F6FE4] ring-2 ring-[#2F6FE4]/30"
                  : "border-[#D9E2EF] hover:border-[#94A3B8]"
              }`}
            >
              <span
                className="block h-14 w-full rounded-[8px] border"
                style={{ ...bg.swatch(palette), borderColor: palette.border }}
                aria-hidden
              />
              <span className="flex items-center justify-between gap-1">
                <span className="text-[12px] font-semibold text-[#111827]">{bg.label}</span>
                {isRecommended && (
                  <span className="rounded-full bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#1E40AF]">
                    Rec
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint that a legacy key is still saved so admins can move forward. */}
      {value && !MODERN_BACKGROUND_STYLES.some((b) => b.key === value) && (
        <div className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] leading-5 text-[#92400E]">
          This event still uses an older background style
          {getBackground(value) ? ` (“${getBackground(value)!.label}”)` : ""}. It
          still renders correctly. Pick a modern style above to update.
        </div>
      )}
    </div>
  );
}


// ============================================================================
// FontPicker
// ============================================================================

function FontPicker({
  value,
  onChange,
  disabled,
  eventName,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  eventName: string;
}) {
  const selected = getEventFont(value);
  // If a stored value isn't in the curated list, show "Default" but keep the
  // raw value visible so the admin understands what's saved.
  const selectValue = selected ? selected.value : value.trim() ? "__unknown__" : "";
  const previewStack =
    selected?.stack ?? (value.trim() ? value.trim() : undefined);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold text-[#111827]">Fonts</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a font for your public event page. Leave on{" "}
          <span className="font-medium">Default</span> to use the GetStampd
          house font.
        </p>
      </div>

      <Field label="Brand font">
        <select
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "__unknown__") return; // can't be re-selected
            onChange(next);
          }}
          disabled={disabled}
          className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Default (GetStampd)</option>
          {selectValue === "__unknown__" && (
            <option value="__unknown__" disabled>
              {value.trim()} (unavailable — pick a font below)
            </option>
          )}
          {(["Sans", "Serif", "Display"] as const).map((cat) => {
            const fonts = EVENT_FONTS.filter((f) => f.category === cat);
            if (fonts.length === 0) return null;
            return (
              <optgroup key={cat} label={cat}>
                {fonts.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </Field>

      <div className="space-y-3 rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] p-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#64748B]">
          Font preview
        </div>
        <div style={previewStack ? { fontFamily: previewStack } : undefined}>
          <div className="text-[11px] uppercase tracking-wide text-[#64748B]">
            Heading
          </div>
          <div className="mt-0.5 text-2xl font-semibold leading-tight text-[#111827]">
            {eventName || "Explore Orange Wine Trail"}
          </div>

          <div className="mt-4 text-[11px] uppercase tracking-wide text-[#64748B]">
            Body
          </div>
          <p className="mt-0.5 text-sm leading-6 text-[#334155]">
            Collect stamps as you visit participating venues and unlock rewards
            along the way.
          </p>

          <div className="mt-4 text-[11px] uppercase tracking-wide text-[#64748B]">
            Accent
          </div>
          <div className="mt-0.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#475569]">
            Your trail passport
          </div>
        </div>
        {!selected && value.trim() && (
          <div className="rounded-[10px] border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-[11px] text-[#92400E]">
            Saved font “{value.trim()}” isn’t in the supported list. Pick one
            above to update; the public page will fall back to the default
            until you do.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ColorRolesCard — simplified semantic text/border colour controls
// ============================================================================

type ColorRolesCardProps = {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  disabled?: boolean;
};

function ColorRolesCard({ form, setForm, disabled }: ColorRolesCardProps) {
  // Resolve the effective theme using the same helper public pages use,
  // so contrast warnings reflect what the customer will actually see.
  const theme = resolveEventTheme({
    palette_key: form.palette_key || null,
    primary_color: form.primary_color || null,
    accent_color: form.accent_color || null,
    page_background_color: form.page_background_color || null,
    card_background_color: form.card_background_color || null,
    text_color: form.text_color || null,
    muted_text_color: form.muted_text_color || null,
    card_text_color: form.card_text_color || null,
    card_muted_text_color: form.card_muted_text_color || null,
    border_color: form.border_color || null,
    primary_text_color: form.primary_text_color || null,
    page_background_key: form.page_background_key || null,
  });

  // Page-surface contrast: page text vs page background.
  const pageTextWarn = surfaceWarning(
    theme.pageText,
    theme.pageBg,
    "page background",
  );
  const pageMutedWarn = surfaceWarning(
    theme.pageMuted,
    theme.pageBg,
    "page background",
    3,
  );
  // Card-surface contrast: card text vs card background.
  const cardTextWarn = surfaceWarning(
    theme.cardText,
    theme.cardBg,
    "card background",
  );
  const cardMutedWarn = surfaceWarning(
    theme.cardMuted,
    theme.cardBg,
    "card background",
    3,
  );
  const primaryButton = surfaceWarning(
    theme.primaryText,
    theme.primary,
    "primary button",
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
          Advanced — custom colours
        </div>
        <div className="mt-1 text-sm font-semibold">Text &amp; border colours</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Page text controls copy that sits directly on the page background.
          Card text controls copy inside cards (venue list, awards, FAQ
          answers, leaderboard rows, etc.). Card colours fall back to the
          page colours when left blank, so existing events keep their look.
        </p>
      </div>

      <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#475569]">
        Page / background text
      </div>
      <ColorRoleRow
        label="Page text colour"
        helper="Body copy and headings drawn directly on the page background (welcome copy, section labels, hero subtitle)."
        resolved={theme.pageText}
        value={form.text_color}
        onChange={(v) => setForm({ ...form, text_color: v })}
        disabled={disabled}
        warnings={pageTextWarn ? [pageTextWarn] : []}
      />
      <ColorRoleRow
        label="Page muted text colour"
        helper="Helper / metadata text on the page background."
        resolved={theme.pageMuted}
        value={form.muted_text_color}
        onChange={(v) => setForm({ ...form, muted_text_color: v })}
        disabled={disabled}
        warnings={pageMutedWarn ? [pageMutedWarn] : []}
      />

      <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#475569]">
        Card / surface text
      </div>
      <ColorRoleRow
        label="Card text colour"
        helper="Headings, venue names and body copy inside cards. Leave blank to reuse the page text colour."
        resolved={theme.cardText}
        value={form.card_text_color}
        onChange={(v) => setForm({ ...form, card_text_color: v })}
        disabled={disabled}
        warnings={cardTextWarn ? [cardTextWarn] : []}
      />
      <ColorRoleRow
        label="Card muted text colour"
        helper="Helper text, addresses, descriptions and metadata inside cards. Leave blank to reuse the page muted colour."
        resolved={theme.cardMuted}
        value={form.card_muted_text_color}
        onChange={(v) => setForm({ ...form, card_muted_text_color: v })}
        disabled={disabled}
        warnings={cardMutedWarn ? [cardMutedWarn] : []}
      />

      <div className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#475569]">
        Borders &amp; brand
      </div>
      <ColorRoleRow
        label="Border / divider colour"
        helper="Card borders, dividers, input outlines on the public pages."
        resolved={theme.border}
        value={form.border_color}
        onChange={(v) => setForm({ ...form, border_color: v })}
        disabled={disabled}
      />
      <ColorRoleRow
        label="Primary button text colour"
        helper="Text and icons drawn on top of the primary brand colour."
        resolved={theme.primaryText}
        value={form.primary_text_color}
        onChange={(v) => setForm({ ...form, primary_text_color: v })}
        disabled={disabled}
        warnings={primaryButton ? [primaryButton] : []}
      />
    </div>
  );
}

function ColorRoleRow({
  label,
  helper,
  resolved,
  value,
  onChange,
  disabled,
  warnings,
}: {
  label: string;
  helper: string;
  resolved: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  warnings?: string[];
}) {
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const pickerValue = HEX.test(value) ? value : resolved;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[#334155]">{label}</span>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Reset to palette
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={resolved}
          disabled={disabled}
          maxLength={7}
          className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {warnings && warnings.length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] leading-5 text-[#92400E]"
        >
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function surfaceWarning(
  fg: string,
  bg: string,
  surfaceLabel: string,
  threshold = 4.5,
): string | null {
  const ratio = contrastRatio(fg, bg);
  if (ratio == null) return null;
  if (ratio >= threshold) return null;
  return `Low contrast on ${surfaceLabel} (${ratio.toFixed(2)}:1, needs ≥${threshold}:1).`;
}

// ============================================================================
// SemanticPreview — sample UI drawn entirely from --event-* tokens so the
// admin sees the exact same theme variables the public passport renders.
// ============================================================================

function SemanticPreview({ venueLabelPlural }: { venueLabelPlural: string }) {
  return (
    <div
      className="mt-4 space-y-3 rounded-[12px] p-3"
      style={{
        backgroundColor: "var(--event-page-bg)",
        border: "1px solid var(--event-border)",
      }}
    >
      <div
        className="text-[10px] font-medium uppercase tracking-[0.22em]"
        style={{ color: "var(--event-muted)" }}
      >
        Semantic tokens preview
      </div>

      <div>
        <h4
          className="text-base font-semibold"
          style={{ color: "var(--event-text)" }}
        >
          Sample heading
        </h4>
        <p className="text-sm" style={{ color: "var(--event-text)" }}>
          This body paragraph uses the main text colour.
        </p>
        <p className="text-xs" style={{ color: "var(--event-muted)" }}>
          This is muted helper text used for metadata and descriptions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-[10px] px-3 text-xs font-semibold"
          style={{
            backgroundColor: "var(--event-primary)",
            color: "var(--event-primary-fg)",
          }}
        >
          Primary button
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-[10px] border px-3 text-xs font-semibold"
          style={{
            backgroundColor: "var(--event-card-bg)",
            borderColor: "var(--event-border)",
            color: "var(--event-text)",
          }}
        >
          Secondary button
        </button>
      </div>

      <div
        className="rounded-[10px] p-3"
        style={{
          backgroundColor: "var(--event-card-bg)",
          border: "1px solid var(--event-border)",
        }}
      >
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--event-text)" }}
        >
          Sample card
        </div>
        <div className="text-xs" style={{ color: "var(--event-muted)" }}>
          Cards and surfaces use the card background colour.
        </div>
      </div>

      <div
        className="flex items-center justify-between rounded-[10px] px-3 py-2"
        style={{
          backgroundColor: "var(--event-card-bg)",
          border: "1px solid var(--event-border)",
        }}
      >
        <div>
          <div
            className="text-sm font-medium"
            style={{ color: "var(--event-text)" }}
          >
            Sample {venueLabelPlural.toLowerCase().replace(/s$/, "")} row
          </div>
          <div className="text-xs" style={{ color: "var(--event-muted)" }}>
            123 Sample Street · Open now
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: "var(--event-accent)",
            color: "var(--event-primary-fg)",
          }}
        >
          Open
        </span>
      </div>

      <div
        className="flex items-center justify-between rounded-[10px] px-3 py-2"
        style={{
          backgroundColor: "var(--event-card-bg)",
          border: "1px solid var(--event-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              backgroundColor: "var(--event-primary)",
              color: "var(--event-primary-fg)",
            }}
          >
            1
          </span>
          <div
            className="text-sm font-medium"
            style={{ color: "var(--event-text)" }}
          >
            Top stamp collector
          </div>
        </div>
        <div className="text-xs" style={{ color: "var(--event-muted)" }}>
          12 stamps
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HeroOverlayCard — colour + opacity slider for the hero image fade.
// ============================================================================

function HeroOverlayCard({
  form,
  setForm,
  disabled,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  disabled?: boolean;
}) {
  const opacityNum = form.hero_overlay_opacity
    ? Math.max(0, Math.min(100, Number(form.hero_overlay_opacity) || 0))
    : null;
  const colorPickerValue = HEX_RE.test(form.hero_overlay_color)
    ? form.hero_overlay_color
    : HEX_RE.test(form.primary_color)
      ? form.primary_color
      : "#1F3D2B";

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">Hero image fade</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Darken or tint the hero image so the event title, logo, and passport
          icon stay readable. Defaults to your primary colour when left blank.
        </p>
      </div>

      <Field label="Overlay colour">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={colorPickerValue}
            onChange={(e) => setForm({ ...form, hero_overlay_color: e.target.value })}
            disabled={disabled}
            className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="text"
            value={form.hero_overlay_color}
            onChange={(e) => setForm({ ...form, hero_overlay_color: e.target.value })}
            placeholder="(uses primary colour)"
            disabled={disabled}
            maxLength={7}
            className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {form.hero_overlay_color && !disabled && (
            <button
              type="button"
              onClick={() => setForm({ ...form, hero_overlay_color: "" })}
              className="text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
      </Field>

      <Field label={`Overlay opacity${opacityNum != null ? ` — ${opacityNum}%` : " — default gradient"}`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={opacityNum ?? 50}
            onChange={(e) =>
              setForm({ ...form, hero_overlay_opacity: e.target.value })
            }
            disabled={disabled}
            className="h-10 flex-1"
          />
          {form.hero_overlay_opacity && !disabled && (
            <button
              type="button"
              onClick={() => setForm({ ...form, hero_overlay_opacity: "" })}
              className="text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Use default
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Leave on “default gradient” to keep the existing soft fade. Drag the
          slider to apply a flat overlay tint at the chosen opacity.
        </p>
      </Field>
    </div>
  );
}

// ============================================================================
// CollapsibleSection
// ============================================================================

function CollapsibleSection({
  id,
  title,
  subtitle,
  warningCount,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  warningCount?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#D9E2EF] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        aria-expanded={expanded}
        aria-controls={`section-${id}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#111827]">{title}</span>
            {!!warningCount && (
              <span
                className="inline-flex h-5 items-center rounded-full bg-[#FEF2F2] px-1.5 text-[11px] font-semibold text-[#B91C1C]"
                title={`${warningCount} contrast warning${warningCount > 1 ? "s" : ""}`}
              >
                {warningCount}
              </span>
            )}
          </div>
          {!expanded && subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[#64748B] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div id={`section-${id}`} className="border-t border-[#E6ECF4] px-6 pb-6 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function countTextBorderWarnings(form: Form): number {
  const theme = resolveEventTheme({
    palette_key: form.palette_key || null,
    primary_color: form.primary_color || null,
    accent_color: form.accent_color || null,
    page_background_color: form.page_background_color || null,
    card_background_color: form.card_background_color || null,
    text_color: form.text_color || null,
    muted_text_color: form.muted_text_color || null,
    card_text_color: form.card_text_color || null,
    card_muted_text_color: form.card_muted_text_color || null,
    border_color: form.border_color || null,
    primary_text_color: form.primary_text_color || null,
    page_background_key: form.page_background_key || null,
  });
  let count = 0;
  if (surfaceWarning(theme.pageText, theme.pageBg, "page background")) count++;
  if (surfaceWarning(theme.pageMuted, theme.pageBg, "page background", 3)) count++;
  if (surfaceWarning(theme.cardText, theme.cardBg, "card background")) count++;
  if (surfaceWarning(theme.cardMuted, theme.cardBg, "card background", 3)) count++;
  if (surfaceWarning(theme.primaryText, theme.primary, "primary button")) count++;
  return count;
}

