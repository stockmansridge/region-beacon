import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EventPaletteScope } from "@/components/event-palette-scope";
import { resolveEventTheme } from "@/lib/event-theme";
import { contrastRatio } from "@/lib/contrast";
import {
  EVENT_FONTS,
  buildGoogleFontsHref,
  getEventFont,
  isSupportedEventFont,
} from "@/lib/event-fonts";
import {
  BRAND_KITS,
  BRAND_KIT_VERSION,
  type BrandKit,
  type BrandKitKey,
  getBrandKit,
} from "@/lib/event-brand-kits";

export const Route = createFileRoute("/admin/events/$eventId_/branding")({
  head: () => ({ meta: [{ title: "Edit customer landing page" }] }),
  component: BrandingEditor,
  codeSplitGroupings: [],
});

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

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
  font_family: string | null;
  heading_font_family: string | null;
  default_emotive_font_family: string | null;

  welcome_copy: string | null;
  terms_url: string | null;
  venue_label_singular: string | null;
  venue_label_plural: string | null;

  // Brand
  primary_color: string | null;
  accent_color: string | null;
  link_color: string | null;
  // Page surface (legacy + Phase D)
  page_background_color: string | null;
  text_color: string | null;
  muted_text_color: string | null;
  border_color: string | null;
  page_heading_color: string | null;
  page_body_color: string | null;
  page_muted_color: string | null;
  // Card surface
  card_background_color: string | null;
  card_text_color: string | null;
  card_muted_text_color: string | null;
  card_border_color: string | null;
  card_heading_color: string | null;
  card_body_color: string | null;
  card_muted_color: string | null;
  // Buttons
  primary_text_color: string | null; // legacy primary button text
  button_primary_bg: string | null;
  button_primary_fg: string | null;
  button_secondary_bg: string | null;
  button_secondary_fg: string | null;
  // Navigation
  nav_background_color: string | null;
  nav_fg_color: string | null;
  nav_muted_color: string | null;
  nav_active_fg_color: string | null;
  // Hero
  hero_bg_color: string | null;
  hero_fg_color: string | null;
  hero_accent_color: string | null;
  hero_overlay_color: string | null;
  hero_overlay_opacity: number | null;

  // Brand Kit metadata
  brand_kit_key: string | null;
  brand_kit_version: number | null;

  // Retained but no longer editable from the admin UI
  palette_key: string | null;
  page_background_key: string | null;
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
  font_family: string;
  heading_font_family: string;
  default_emotive_font_family: string;

  welcome_copy: string;
  terms_url: string;
  venue_label_singular: string;
  venue_label_plural: string;

  brand_kit_key: string; // "" | BrandKitKey | "custom"

  // Brand
  primary_color: string;
  accent_color: string;
  link_color: string;
  // Page
  page_background_color: string;
  page_heading_color: string;
  page_body_color: string;
  page_muted_color: string;
  border_color: string;
  // Cards
  card_background_color: string;
  card_heading_color: string;
  card_body_color: string;
  card_muted_color: string;
  card_border_color: string;
  // Buttons
  button_primary_bg: string;
  button_primary_fg: string;
  button_secondary_bg: string;
  button_secondary_fg: string;
  // Navigation
  nav_background_color: string;
  nav_fg_color: string;
  nav_muted_color: string;
  nav_active_fg_color: string;
  // Hero
  hero_bg_color: string;
  hero_fg_color: string;
  hero_accent_color: string;
  hero_overlay_color: string;
  hero_overlay_opacity: string; // empty = default gradient
};

const EMPTY_FORM: Form = {
  font_family: "",
  heading_font_family: "",
  default_emotive_font_family: "",

  welcome_copy: "",
  terms_url: "",
  venue_label_singular: DEFAULT_VENUE_LABEL_SINGULAR,
  venue_label_plural: DEFAULT_VENUE_LABEL_PLURAL,
  brand_kit_key: "",
  primary_color: "",
  accent_color: "",
  link_color: "",
  page_background_color: "",
  page_heading_color: "",
  page_body_color: "",
  page_muted_color: "",
  border_color: "",
  card_background_color: "",
  card_heading_color: "",
  card_body_color: "",
  card_muted_color: "",
  card_border_color: "",
  button_primary_bg: "",
  button_primary_fg: "",
  button_secondary_bg: "",
  button_secondary_fg: "",
  nav_background_color: "",
  nav_fg_color: "",
  nav_muted_color: "",
  nav_active_fg_color: "",
  hero_bg_color: "",
  hero_fg_color: "",
  hero_accent_color: "",
  hero_overlay_color: "",
  hero_overlay_opacity: "",
};

/** Form keys that, when edited, should flip brand_kit_key to "custom". */
const COLOUR_FORM_KEYS: ReadonlyArray<keyof Form> = [
  "primary_color", "accent_color", "link_color",
  "page_background_color", "page_heading_color", "page_body_color", "page_muted_color", "border_color",
  "card_background_color", "card_heading_color", "card_body_color", "card_muted_color", "card_border_color",
  "button_primary_bg", "button_primary_fg", "button_secondary_bg", "button_secondary_fg",
  "nav_background_color", "nav_fg_color", "nav_muted_color", "nav_active_fg_color",
  "hero_bg_color", "hero_fg_color", "hero_accent_color",
];

const SELECT_COLS = [
  "logo_path", "cover_path", "font_family", "heading_font_family", "default_emotive_font_family", "welcome_copy", "terms_url",
  "venue_label_singular", "venue_label_plural",
  "primary_color", "accent_color", "link_color",
  "page_background_color", "text_color", "muted_text_color", "border_color",
  "page_heading_color", "page_body_color", "page_muted_color",
  "card_background_color", "card_text_color", "card_muted_text_color", "card_border_color",
  "card_heading_color", "card_body_color", "card_muted_color",
  "primary_text_color",
  "button_primary_bg", "button_primary_fg", "button_secondary_bg", "button_secondary_fg",
  "nav_background_color", "nav_fg_color", "nav_muted_color", "nav_active_fg_color",
  "hero_bg_color", "hero_fg_color", "hero_accent_color",
  "hero_overlay_color", "hero_overlay_opacity",
  "brand_kit_key", "brand_kit_version",
  "palette_key", "page_background_key",
].join(", ");

function brandingToForm(b: Branding | null): Form {
  if (!b) return EMPTY_FORM;
  return {
    font_family: b.font_family ?? "",
    heading_font_family: b.heading_font_family ?? "",
    default_emotive_font_family: b.default_emotive_font_family ?? "",

    welcome_copy: b.welcome_copy ?? "",
    terms_url: b.terms_url ?? "",
    venue_label_singular: b.venue_label_singular ?? DEFAULT_VENUE_LABEL_SINGULAR,
    venue_label_plural: b.venue_label_plural ?? DEFAULT_VENUE_LABEL_PLURAL,
    brand_kit_key: b.brand_kit_key ?? "",
    primary_color: b.primary_color ?? "",
    accent_color: b.accent_color ?? "",
    link_color: b.link_color ?? "",
    page_background_color: b.page_background_color ?? "",
    page_heading_color: b.page_heading_color ?? b.text_color ?? "",
    page_body_color: b.page_body_color ?? "",
    page_muted_color: b.page_muted_color ?? b.muted_text_color ?? "",
    border_color: b.border_color ?? "",
    card_background_color: b.card_background_color ?? "",
    card_heading_color: b.card_heading_color ?? b.card_text_color ?? "",
    card_body_color: b.card_body_color ?? "",
    card_muted_color: b.card_muted_color ?? b.card_muted_text_color ?? "",
    card_border_color: b.card_border_color ?? "",
    button_primary_bg: b.button_primary_bg ?? "",
    button_primary_fg: b.button_primary_fg ?? b.primary_text_color ?? "",
    button_secondary_bg: b.button_secondary_bg ?? "",
    button_secondary_fg: b.button_secondary_fg ?? "",
    nav_background_color: b.nav_background_color ?? "",
    nav_fg_color: b.nav_fg_color ?? "",
    nav_muted_color: b.nav_muted_color ?? "",
    nav_active_fg_color: b.nav_active_fg_color ?? "",
    hero_bg_color: b.hero_bg_color ?? "",
    hero_fg_color: b.hero_fg_color ?? "",
    hero_accent_color: b.hero_accent_color ?? "",
    hero_overlay_color: b.hero_overlay_color ?? "",
    hero_overlay_opacity:
      b.hero_overlay_opacity != null ? String(b.hero_overlay_opacity) : "",
  };
}

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
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    kit: true,
    brand: true,
    page: false,
    cards: false,
    buttons: false,
    nav: false,
    hero: false,
    fonts: false,
    pageContent: false,
  });
  const toggle = (k: string) =>
    setExpanded((p) => ({ ...p, [k]: !p[k] }));

  /** Edit a colour field — flips brand_kit_key to "custom". */
  function editColour<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (COLOUR_FORM_KEYS.includes(key) && f.brand_kit_key && f.brand_kit_key !== "custom") {
        next.brand_kit_key = "custom";
      }
      return next;
    });
  }

  /** Apply a Brand Kit — overwrites every colour field. */
  function applyBrandKit(kit: BrandKit) {
    setForm((f) => ({
      ...f,
      brand_kit_key: kit.key,
      primary_color: kit.colors.primary_color,
      accent_color: kit.colors.accent_color,
      link_color: kit.colors.link_color,
      page_background_color: kit.colors.page_background_color,
      page_heading_color: kit.colors.text_color,
      page_body_color: kit.colors.text_color,
      page_muted_color: kit.colors.muted_text_color,
      border_color: kit.colors.border_color,
      card_background_color: kit.colors.card_background_color,
      card_heading_color: kit.colors.card_text_color,
      card_body_color: kit.colors.card_text_color,
      card_muted_color: kit.colors.card_muted_text_color,
      card_border_color: kit.colors.card_border_color,
      button_primary_bg: kit.colors.button_primary_bg,
      button_primary_fg: kit.colors.button_primary_fg,
      button_secondary_bg: kit.colors.button_secondary_bg,
      button_secondary_fg: kit.colors.button_secondary_fg,
      nav_background_color: kit.colors.nav_background_color,
      nav_fg_color: kit.colors.nav_fg_color,
      nav_muted_color: kit.colors.nav_muted_color,
      nav_active_fg_color: kit.colors.nav_active_fg_color,
      hero_bg_color: kit.colors.hero_bg_color,
      hero_fg_color: kit.colors.hero_fg_color,
      hero_accent_color: kit.colors.hero_accent_color,
    }));
  }

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
      if (evErr) { setState("error"); return; }
      if (!event) { setState("not-found"); return; }

      const [brandingRes, domainsRes, venuesRes] = await Promise.all([
        supabase
          .from("event_branding")
          .select(SELECT_COLS)
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
      setForm(brandingToForm(branding));
      setState("ready");
    })();
    return () => { cancelled = true; };
  }, [agency.status, agencyId, eventId, reloadKey]);

  // Lazy-load the chosen Google Font(s) — both body and heading.
  useEffect(() => {
    const href = buildGoogleFontsHref([form.font_family, form.heading_font_family, form.default_emotive_font_family]);
    if (!href) return;
    if (document.querySelector(`link[data-event-font="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.eventFont = href;
    document.head.appendChild(link);
  }, [form.font_family, form.heading_font_family, form.default_emotive_font_family]);


  // Preload every supported event font so the Branding font dropdowns
  // can render each option in its own typeface for preview.
  useEffect(() => {
    const href = buildGoogleFontsHref(EVENT_FONTS.map((f) => f.value));
    if (!href) return;
    if (document.querySelector(`link[data-event-font="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.eventFont = href;
    document.head.appendChild(link);
  }, []);

  async function onSave(opts?: { returnAfter?: boolean }) {
    if (!bundle || !agencyId || !canEdit) return;

    // Field-level validation.
    const trim = (s: string) => s.trim();
    const hexCheck = (label: string, v: string): string | null =>
      v && !HEX_RE.test(v) ? `${label} must be a valid 6-digit hex code.` : null;

    const checks: Array<[string, string]> = [
      ["Primary colour", form.primary_color],
      ["Accent colour", form.accent_color],
      ["Link colour", form.link_color],
      ["Page background", form.page_background_color],
      ["Page heading colour", form.page_heading_color],
      ["Page body colour", form.page_body_color],
      ["Page muted colour", form.page_muted_color],
      ["Page border colour", form.border_color],
      ["Card background", form.card_background_color],
      ["Card heading colour", form.card_heading_color],
      ["Card body colour", form.card_body_color],
      ["Card muted colour", form.card_muted_color],
      ["Card border colour", form.card_border_color],
      ["Primary button bg", form.button_primary_bg],
      ["Primary button text", form.button_primary_fg],
      ["Secondary button bg", form.button_secondary_bg],
      ["Secondary button text", form.button_secondary_fg],
      ["Navigation background", form.nav_background_color],
      ["Navigation text", form.nav_fg_color],
      ["Navigation muted", form.nav_muted_color],
      ["Navigation active", form.nav_active_fg_color],
      ["Hero background", form.hero_bg_color],
      ["Hero text", form.hero_fg_color],
      ["Hero accent", form.hero_accent_color],
      ["Hero overlay colour", form.hero_overlay_color],
    ];
    for (const [label, v] of checks) {
      const err = hexCheck(label, trim(v));
      if (err) { setValidationError(err); return; }
    }

    const font_family = trim(form.font_family);
    if (font_family && !isSupportedEventFont(font_family)) {
      setValidationError("Pick a body font from the list."); return;
    }
    const heading_font_family = trim(form.heading_font_family);
    if (heading_font_family && !isSupportedEventFont(heading_font_family)) {
      setValidationError("Pick a heading font from the list."); return;
    }
    const default_emotive_font_family = trim(form.default_emotive_font_family);
    if (default_emotive_font_family && !isSupportedEventFont(default_emotive_font_family)) {
      setValidationError("Pick an emotive font from the list."); return;
    }

    const welcome_copy = trim(form.welcome_copy);
    if (welcome_copy.length > 1000) {
      setValidationError("Welcome copy must be 1000 characters or fewer."); return;
    }
    const terms_url = normalizeWebsiteUrl(form.terms_url) ?? "";
    const venue_label_singular = trim(form.venue_label_singular);
    const venue_label_plural = trim(form.venue_label_plural);
    const sErr = validateVenueLabel(venue_label_singular, "Singular venue label");
    if (sErr) { setValidationError(sErr); return; }
    const pErr = validateVenueLabel(venue_label_plural, "Plural venue label");
    if (pErr) { setValidationError(pErr); return; }

    let hero_overlay_opacity_num: number | null = null;
    if (form.hero_overlay_opacity.trim()) {
      const n = Number(form.hero_overlay_opacity);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setValidationError("Hero overlay opacity must be between 0 and 100."); return;
      }
      hero_overlay_opacity_num = Math.round(n);
    }

    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);

    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const brandKitKey: BrandKitKey | "custom" | null = form.brand_kit_key
      ? (form.brand_kit_key as BrandKitKey | "custom")
      : null;

    // Page heading also writes to legacy text_color so the existing
    // resolver path keeps producing the same --event-text token.
    // Card heading mirrors into card_text_color for the same reason.
    const fullPayload: Record<string, unknown> = {
      font_family: font_family || null,
      heading_font_family: heading_font_family || null,
      default_emotive_font_family: default_emotive_font_family || null,

      welcome_copy: welcome_copy || null,
      terms_url: terms_url || null,
      venue_label_singular,
      venue_label_plural,
      // Brand
      primary_color: orNull(form.primary_color),
      accent_color: orNull(form.accent_color),
      link_color: orNull(form.link_color),
      // Page
      page_background_color: orNull(form.page_background_color),
      page_heading_color: orNull(form.page_heading_color),
      page_body_color: orNull(form.page_body_color),
      page_muted_color: orNull(form.page_muted_color),
      text_color: orNull(form.page_heading_color), // legacy alias
      muted_text_color: orNull(form.page_muted_color), // legacy alias
      border_color: orNull(form.border_color),
      // Cards
      card_background_color: orNull(form.card_background_color),
      card_heading_color: orNull(form.card_heading_color),
      card_body_color: orNull(form.card_body_color),
      card_muted_color: orNull(form.card_muted_color),
      card_text_color: orNull(form.card_heading_color),
      card_muted_text_color: orNull(form.card_muted_color),
      card_border_color: orNull(form.card_border_color),
      // Buttons
      button_primary_bg: orNull(form.button_primary_bg),
      button_primary_fg: orNull(form.button_primary_fg),
      button_secondary_bg: orNull(form.button_secondary_bg),
      button_secondary_fg: orNull(form.button_secondary_fg),
      primary_text_color: orNull(form.button_primary_fg), // legacy mirror
      // Navigation
      nav_background_color: orNull(form.nav_background_color),
      nav_fg_color: orNull(form.nav_fg_color),
      nav_muted_color: orNull(form.nav_muted_color),
      nav_active_fg_color: orNull(form.nav_active_fg_color),
      // Hero
      hero_bg_color: orNull(form.hero_bg_color),
      hero_fg_color: orNull(form.hero_fg_color),
      hero_accent_color: orNull(form.hero_accent_color),
      hero_overlay_color: orNull(form.hero_overlay_color),
      hero_overlay_opacity: hero_overlay_opacity_num,
      // Brand Kit metadata
      brand_kit_key: brandKitKey,
      brand_kit_version: brandKitKey && brandKitKey !== "custom" ? BRAND_KIT_VERSION : null,
    };

    const { data: existing } = await supabase
      .from("event_branding")
      .select("event_id")
      .eq("event_id", bundle.event.id)
      .eq("agency_id", agencyId)
      .maybeSingle();

    async function writeRow(payload: Record<string, unknown>): Promise<{
      row: Branding | null;
      error: { message: string; code?: string | null } | null;
    }> {
      if (!bundle) return { row: null, error: { message: "Internal error." } };
      if (existing) {
        const { data, error } = await supabase
          .from("event_branding")
          .update(payload)
          .eq("event_id", bundle.event.id)
          .eq("agency_id", agencyId!)
          .select(SELECT_COLS)
          .maybeSingle();
        return { row: data as Branding | null, error };
      }
      const { data, error } = await supabase
        .from("event_branding")
        .insert({ agency_id: agencyId!, event_id: bundle.event.id, ...payload })
        .select(SELECT_COLS)
        .maybeSingle();
      return { row: data as Branding | null, error };
    }

    let payload: Record<string, unknown> = fullPayload;
    let { row: savedRow, error: writeErr } = await writeRow(payload);

    // Tolerant fallback: drop any keys the DB rejects as unknown columns
    // (migration not yet applied in some environments) and retry until
    // the write succeeds or the error is unrelated.
    let guard = 0;
    while (writeErr && /column "([^"]+)" of relation/i.test(writeErr.message ?? "") && guard < 12) {
      const m = writeErr.message.match(/column "([^"]+)" of relation/i);
      const col = m?.[1];
      if (!col || !(col in payload)) break;
      console.warn("[branding-save] dropping unknown column and retrying", { col });
      const { [col]: _drop, ...rest } = payload;
      payload = rest;
      const retry = await writeRow(payload);
      savedRow = retry.row;
      writeErr = retry.error;
      guard++;
    }

    if (writeErr) {
      console.warn("[branding-save] write failed", {
        code: writeErr.code ?? null,
        message: writeErr.message,
      });
      setSaving(false);
      setSaveError("Branding could not be saved. Please try again or contact support.");
      return;
    }
    if (!savedRow) {
      setSaving(false);
      setSaveError("Branding could not be saved (no row affected). Please reload the page.");
      return;
    }

    setBundle((b) => (b ? { ...b, branding: savedRow!, hasBranding: true } : b));
    setForm(brandingToForm(savedRow));
    setSaving(false);
    setSaveSuccess("Branding saved.");
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
        .insert({ agency_id: agencyId, event_id: bundle.event.id, ...payload });
      error = inErr ?? null;
    }
    if (error) {
      await deleteEventAssetSafely(newPath);
      return "Saved the file but could not update the event record.";
    }
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
  const venueLabels = resolveVenueLabels({
    venue_label_singular: form.venue_label_singular,
    venue_label_plural: form.venue_label_plural,
  });
  const themeForPreview = resolveEventTheme({
    palette_key: null,
    primary_color: form.primary_color || null,
    accent_color: form.accent_color || null,
    page_background_color: form.page_background_color || null,
    card_background_color: form.card_background_color || null,
    text_color: form.page_heading_color || null,
    muted_text_color: form.page_muted_color || null,
    card_text_color: form.card_heading_color || null,
    card_muted_text_color: form.card_muted_color || null,
    border_color: form.border_color || null,
    primary_text_color: form.button_primary_fg || null,
    nav_background_color: form.nav_background_color || null,
    page_background_key: null,
    brand_kit_key: form.brand_kit_key || null,
    link_color: form.link_color || null,
    card_border_color: form.card_border_color || null,
    button_primary_bg: form.button_primary_bg || null,
    button_primary_fg: form.button_primary_fg || null,
    button_secondary_bg: form.button_secondary_bg || null,
    button_secondary_fg: form.button_secondary_fg || null,
    nav_fg_color: form.nav_fg_color || null,
    nav_muted_color: form.nav_muted_color || null,
    nav_active_fg_color: form.nav_active_fg_color || null,
    hero_bg_color: form.hero_bg_color || null,
    hero_fg_color: form.hero_fg_color || null,
    hero_accent_color: form.hero_accent_color || null,
  });

  const selectedKit = getBrandKit(form.brand_kit_key);
  const kitSubtitle = form.brand_kit_key === "custom"
    ? "Custom — edited"
    : selectedKit
      ? selectedKit.label
      : "No kit selected — using legacy palette";

  return (
    <div className="space-y-5 p-6">
      <Header
        event={event}
        primaryDomain={primaryDomain}
        canEdit={canEdit}
        saving={saving}
        onSave={() => onSave()}
        onSaveAndReturn={() => onSave({ returnAfter: true })}
        onCancel={() => navigate({ to: "/admin/events/$eventId", params: { eventId } })}
        eventId={eventId}
      />

      {!canEdit && (
        <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#334155]">
          You have view-only access. Only organisation owners, organisation admins, and platform admins can edit branding.
        </div>
      )}

      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        {/* ============== LEFT: editor (scrolls independently on md+) ============== */}
        <div className="order-2 space-y-5 md:order-1 md:min-w-0 md:flex-1 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:pr-2">

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

          {/* Brand Kit */}
          <CollapsibleSection
            id="kit"
            title="Brand Kit"
            subtitle={kitSubtitle}
            expanded={expanded.kit}
            onToggle={() => toggle("kit")}
          >
            <BrandKitSelector
              value={form.brand_kit_key}
              onApplyKit={applyBrandKit}
              onClear={() => setForm({ ...EMPTY_FORM,
                font_family: form.font_family,
                heading_font_family: form.heading_font_family,
                welcome_copy: form.welcome_copy,
                terms_url: form.terms_url,
                venue_label_singular: form.venue_label_singular,
                venue_label_plural: form.venue_label_plural,
                hero_overlay_opacity: form.hero_overlay_opacity,
              })}
              disabled={!canEdit || saving}
            />
          </CollapsibleSection>

          {/* Brand */}
          <CollapsibleSection
            id="brand"
            title="Brand"
            subtitle={`Primary ${form.primary_color || "—"} · Accent ${form.accent_color || "—"}`}
            expanded={expanded.brand}
            onToggle={() => toggle("brand")}
          >
            <div className="space-y-4">
              <ColorRoleRow label="Primary colour" helper="Brand colour used across CTAs, highlights, and bottom-nav default."
                resolved={themeForPreview.primary} value={form.primary_color}
                onChange={(v) => editColour("primary_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Accent colour" helper="Highlight colour used for active states, badges and accents."
                resolved={themeForPreview.accent} value={form.accent_color}
                onChange={(v) => editColour("accent_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Link colour" helper="Inline links on the public pages."
                resolved={themeForPreview.link} value={form.link_color}
                onChange={(v) => editColour("link_color", v)} disabled={!canEdit || saving} />
            </div>
          </CollapsibleSection>

          {/* Page */}
          <CollapsibleSection
            id="page"
            title="Page"
            subtitle="Background, heading, body, muted, border on the page surface"
            warningCount={countWarnings(themeForPreview, "page")}
            expanded={expanded.page}
            onToggle={() => toggle("page")}
          >
            <div className="space-y-4">
              <ColorRoleRow label="Page background" helper="Painted behind everything on the public passport pages."
                resolved={themeForPreview.pageBg} value={form.page_background_color}
                onChange={(v) => editColour("page_background_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Page heading colour" helper="Section headings and headlines on the page background."
                resolved={themeForPreview.pageText} value={form.page_heading_color}
                onChange={(v) => editColour("page_heading_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.pageText, themeForPreview.pageBg, "page background")} />
              <ColorRoleRow label="Page body text colour" helper="Body copy on the page background. Falls back to the heading colour when blank."
                resolved={themeForPreview.pageText} value={form.page_body_color}
                onChange={(v) => editColour("page_body_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Page muted text colour" helper="Helper / metadata text on the page background."
                resolved={themeForPreview.pageMuted} value={form.page_muted_color}
                onChange={(v) => editColour("page_muted_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.pageMuted, themeForPreview.pageBg, "page background", 3)} />
              <ColorRoleRow label="Page border colour" helper="Dividers and outlines on the page surface."
                resolved={themeForPreview.border} value={form.border_color}
                onChange={(v) => editColour("border_color", v)} disabled={!canEdit || saving} />
            </div>
          </CollapsibleSection>

          {/* Cards */}
          <CollapsibleSection
            id="cards"
            title="Cards"
            subtitle="Surfaces, headings, body, muted, border inside cards"
            warningCount={countWarnings(themeForPreview, "card")}
            expanded={expanded.cards}
            onToggle={() => toggle("cards")}
          >
            <div className="space-y-4">
              <ColorRoleRow label="Card background" helper="Background colour for venue cards, awards cards, etc."
                resolved={themeForPreview.cardBg} value={form.card_background_color}
                onChange={(v) => editColour("card_background_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Card heading colour" helper="Headings inside cards (venue name, award title)."
                resolved={themeForPreview.cardText} value={form.card_heading_color}
                onChange={(v) => editColour("card_heading_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.cardText, themeForPreview.cardBg, "card background")} />
              <ColorRoleRow label="Card body text colour" helper="Body copy inside cards. Falls back to the card heading colour."
                resolved={themeForPreview.cardText} value={form.card_body_color}
                onChange={(v) => editColour("card_body_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Card muted text colour" helper="Addresses, descriptions, metadata inside cards."
                resolved={themeForPreview.cardMuted} value={form.card_muted_color}
                onChange={(v) => editColour("card_muted_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.cardMuted, themeForPreview.cardBg, "card background", 3)} />
              <ColorRoleRow label="Card border colour" helper="Borders / dividers on cards. Falls back to the page border."
                resolved={themeForPreview.cardBorder} value={form.card_border_color}
                onChange={(v) => editColour("card_border_color", v)} disabled={!canEdit || saving} />
            </div>
          </CollapsibleSection>

          {/* Buttons */}
          <CollapsibleSection
            id="buttons"
            title="Buttons"
            subtitle="Primary and secondary button colours"
            warningCount={countWarnings(themeForPreview, "button")}
            expanded={expanded.buttons}
            onToggle={() => toggle("buttons")}
          >
            <div className="space-y-4">
              <ColorRoleRow label="Primary button background" helper="Background colour for the primary CTA buttons."
                resolved={themeForPreview.buttonPrimaryBg} value={form.button_primary_bg}
                onChange={(v) => editColour("button_primary_bg", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Primary button text" helper="Text / icons drawn on the primary button."
                resolved={themeForPreview.buttonPrimaryFg} value={form.button_primary_fg}
                onChange={(v) => editColour("button_primary_fg", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.buttonPrimaryFg, themeForPreview.buttonPrimaryBg, "primary button")} />
              <ColorRoleRow label="Secondary button background" helper="Background colour for secondary CTAs."
                resolved={themeForPreview.buttonSecondaryBg} value={form.button_secondary_bg}
                onChange={(v) => editColour("button_secondary_bg", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Secondary button text" helper="Text / icons on the secondary button."
                resolved={themeForPreview.buttonSecondaryFg} value={form.button_secondary_fg}
                onChange={(v) => editColour("button_secondary_fg", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.buttonSecondaryFg, themeForPreview.buttonSecondaryBg, "secondary button")} />
            </div>
          </CollapsibleSection>

          {/* Navigation */}
          <CollapsibleSection
            id="nav"
            title="Navigation"
            subtitle="Header / mobile bottom-nav / drawer"
            warningCount={countWarnings(themeForPreview, "nav")}
            expanded={expanded.nav}
            onToggle={() => toggle("nav")}
          >
            <div className="space-y-4">
              <ColorRoleRow label="Navigation background" helper="Sticky header, mobile bottom-nav and side drawer."
                resolved={themeForPreview.navBg} value={form.nav_background_color}
                onChange={(v) => editColour("nav_background_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Navigation inactive text / icon" helper="Default nav-item colour."
                resolved={themeForPreview.navText} value={form.nav_fg_color}
                onChange={(v) => editColour("nav_fg_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.navText, themeForPreview.navBg, "nav background")} />
              <ColorRoleRow label="Navigation muted text / icon" helper="Subtle nav labels (e.g. badge counts)."
                resolved={themeForPreview.navMuted} value={form.nav_muted_color}
                onChange={(v) => editColour("nav_muted_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Navigation active text / icon" helper="Colour for the currently selected nav item."
                resolved={themeForPreview.navActiveText} value={form.nav_active_fg_color}
                onChange={(v) => editColour("nav_active_fg_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.navActiveText, themeForPreview.navBg, "nav background", 3)} />
            </div>
          </CollapsibleSection>

          {/* Hero */}
          <CollapsibleSection
            id="hero"
            title="Hero"
            subtitle="Top banner colours and overlay"
            expanded={expanded.hero}
            onToggle={() => toggle("hero")}
          >
            <div className="space-y-4">
              <ColorRoleRow label="Hero background / overlay" helper="Background tint behind the event title when there is no cover image."
                resolved={themeForPreview.heroBg} value={form.hero_bg_color}
                onChange={(v) => editColour("hero_bg_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Hero text colour" helper="Event title and subtitle on top of the hero."
                resolved={themeForPreview.heroFg} value={form.hero_fg_color}
                onChange={(v) => editColour("hero_fg_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.heroFg, themeForPreview.heroBg, "hero background")} />
              <ColorRoleRow label="Hero accent colour" helper="Accent flourish on the hero (badge, dot, underline)."
                resolved={themeForPreview.heroAccent} value={form.hero_accent_color}
                onChange={(v) => editColour("hero_accent_color", v)} disabled={!canEdit || saving} />
              <HeroOverlayCard
                colorValue={form.hero_overlay_color}
                opacityValue={form.hero_overlay_opacity}
                primaryFallback={form.primary_color || themeForPreview.primary}
                disabled={!canEdit || saving}
                onColorChange={(v) => editColour("hero_overlay_color", v)}
                onOpacityChange={(v) => setForm({ ...form, hero_overlay_opacity: v })}
              />
            </div>
          </CollapsibleSection>

          {/* Fonts */}
          <CollapsibleSection
            id="fonts"
            title="Fonts"
            subtitle={(() => {
              const h = form.heading_font_family ? (getEventFont(form.heading_font_family)?.label ?? form.heading_font_family) : "—";
              const b = form.font_family ? (getEventFont(form.font_family)?.label ?? form.font_family) : "Default";
              return `Heading: ${h} · Body: ${b}`;
            })()}
            expanded={expanded.fonts}
            onToggle={() => toggle("fonts")}
          >
            <FontPickers
              headingValue={form.heading_font_family}
              bodyValue={form.font_family}
              emotiveValue={form.default_emotive_font_family}
              onHeadingChange={(value) => setForm({ ...form, heading_font_family: value })}
              onBodyChange={(value) => setForm({ ...form, font_family: value })}
              onEmotiveChange={(value) => setForm({ ...form, default_emotive_font_family: value })}
              disabled={!canEdit || saving}
              eventName={event.name}
            />

          </CollapsibleSection>

          {/* Page content (welcome copy + labels) */}
          <CollapsibleSection
            id="pageContent"
            title="Page content"
            subtitle="Welcome copy and venue labels"
            expanded={expanded.pageContent}
            onToggle={() => toggle("pageContent")}
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

              <Field label="Singular venue label">
                <input type="text" value={form.venue_label_singular}
                  onChange={(e) => setForm({ ...form, venue_label_singular: e.target.value })}
                  placeholder="Venue" disabled={!canEdit || saving} maxLength={VENUE_LABEL_MAX}
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50" />
              </Field>
              <Field label="Plural venue label">
                <input type="text" value={form.venue_label_plural}
                  onChange={(e) => setForm({ ...form, venue_label_plural: e.target.value })}
                  placeholder="Venues" disabled={!canEdit || saving} maxLength={VENUE_LABEL_MAX}
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50" />
              </Field>
            </div>
          </CollapsibleSection>
        </div>

        {/* ============== RIGHT: live preview + uploads (pinned on md+) ============== */}
        <div
          id="live-preview"
          className="order-1 space-y-5 scroll-mt-4 md:order-2 md:w-[420px] md:shrink-0 md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:pr-1"
        >

          <div className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[#111827]">Live preview</h3>
                <p className="text-sm leading-6 text-[#64748B]">
                  Reflects the current public passport rendering. Uses compatibility aliases so existing events with no Brand Kit look unchanged.
                </p>
              </div>
            </div>
            <EventPaletteScope
              paletteKey={null}
              backgroundKey={null}
              primaryColor={form.primary_color}
              accentColor={form.accent_color}
              pageBackgroundColor={form.page_background_color}
              cardBackgroundColor={form.card_background_color}
              textColor={form.page_heading_color}
              mutedTextColor={form.page_muted_color}
              cardTextColor={form.card_heading_color}
              cardMutedTextColor={form.card_muted_color}
              borderColor={form.border_color}
              primaryTextColor={form.button_primary_fg}
              navBackgroundColor={form.nav_background_color}
              brandKitKey={form.brand_kit_key || null}
              linkColor={form.link_color}
              cardBorderColor={form.card_border_color}
              buttonPrimaryBg={form.button_primary_bg}
              buttonPrimaryFg={form.button_primary_fg}
              buttonSecondaryBg={form.button_secondary_bg}
              buttonSecondaryFg={form.button_secondary_fg}
              navFgColor={form.nav_fg_color}
              navMutedColor={form.nav_muted_color}
              navActiveFgColor={form.nav_active_fg_color}
              heroBgColor={form.hero_bg_color}
              heroFgColor={form.hero_fg_color}
              heroAccentColor={form.hero_accent_color}
              fontFamily={getEventFont(form.font_family)?.stack ?? (form.font_family.trim() || null)}
              headingFontFamily={getEventFont(form.heading_font_family)?.stack ?? (form.heading_font_family.trim() || null)}
              className="overflow-hidden rounded-[16px] border border-[#E6ECF4] bg-[#F8FAFC] p-4"
            >
              <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--event-page-muted, #8A7E66)" }}>
                <span>Customer landing — live preview</span>
                <span>Mobile</span>
              </div>
              <TrailLanding
                eventName={event.name}
                welcomeCopy={form.welcome_copy.trim() || "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail."}
                primaryColor={HEX_RE.test(form.primary_color.trim()) ? form.primary_color.trim() : themeForPreview.primary}
                accentColor={HEX_RE.test(form.accent_color.trim()) ? form.accent_color.trim() : themeForPreview.accent}
                fontFamily={getEventFont(form.font_family)?.stack ?? (form.font_family.trim() || undefined)}
                headingFontFamily={getEventFont(form.heading_font_family)?.stack ?? (form.heading_font_family.trim() || undefined)}
                venueCount={venueCount}
                venueLabelPlural={venueLabels.plural}
                logoUrl={getEventAssetPublicUrl(branding?.logo_path)}
                heroImageUrl={getEventAssetPublicUrl(branding?.cover_path)}
                badge="Preview"
                termsUrl={null}
                heroOverlayColor={form.hero_overlay_color || null}
                heroOverlayOpacity={form.hero_overlay_opacity.trim() ? Number(form.hero_overlay_opacity) : null}
              />
              <SemanticPreview venueLabelPlural={venueLabels.plural} />
            </EventPaletteScope>
          </div>

          <AssetUploader
            kind="logo"
            currentPath={branding?.logo_path ?? null}
            canEdit={canEdit}
            onUpload={async (file) => {
              if (!agencyId) return "Select an organisation before uploading.";
              const res = await uploadEventAsset({ agencyId, eventId: event.id, kind: "logo", file });
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
              const res = await uploadEventAsset({ agencyId, eventId: event.id, kind: "cover", file });
              if (!res.ok) return res.error;
              return persistAssetPath("cover", res.path, branding?.cover_path ?? null);
            }}
            onRemove={() => removeAsset("cover", branding?.cover_path ?? null)}
          />

          {canEdit && (
            <div className="flex flex-wrap gap-2 rounded-[16px] border border-[#D9E2EF] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <button type="button" onClick={() => onSave()} disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] border border-[#2F6FE4] bg-white px-4 text-sm font-semibold text-[#2F6FE4] hover:bg-[#EAF2FF] disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => onSave({ returnAfter: true })} disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "Saving…" : "Save & return"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating "Preview" jump-to pill — mobile only */}
      <a
        href="#live-preview"
        className="fixed bottom-4 right-4 z-40 inline-flex h-11 items-center gap-1.5 rounded-full bg-[#111827] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-lg md:hidden"
      >
        <span aria-hidden>👁</span> Preview
      </a>
    </div>
  );
}


// ============================================================================
// Header — top action bar
// ============================================================================
function Header({
  event, primaryDomain, canEdit, saving, onSave, onSaveAndReturn, onCancel, eventId,
}: {
  event: EventRow;
  primaryDomain: Domain | null;
  canEdit: boolean;
  saving: boolean;
  onSave: () => void;
  onSaveAndReturn: () => void;
  onCancel: () => void;
  eventId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-[#64748B]">Customer landing page</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#111827]">{event.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
          <span className="rounded-full border border-[#D9E2EF] bg-white px-2.5 py-0.5">Status: {event.status}</span>
          <span className="rounded-full border border-[#D9E2EF] bg-white px-2.5 py-0.5">Slug: {event.public_slug ?? "—"}</span>
          <span className="rounded-full border border-[#D9E2EF] bg-white px-2.5 py-0.5">
            {primaryDomain
              ? `${primaryDomain.public_subdomain ?? primaryDomain.custom_domain ?? "—"} · ${primaryDomain.status}`
              : "No domain configured"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/admin/events/$eventId" params={{ eventId }}
          className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]">
          ← Back to event
        </Link>
        <Link to="/admin/events/$eventId/preview" params={{ eventId }} target="_blank"
          className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]">
          Open full preview
        </Link>
        <button type="button" onClick={onCancel} disabled={saving}
          className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50">
          Discard changes
        </button>
        {canEdit && (
          <>
            <button type="button" onClick={onSave} disabled={saving}
              className="inline-flex h-10 items-center rounded-[10px] border border-[#2F6FE4] bg-white px-4 text-sm font-semibold text-[#2F6FE4] hover:bg-[#EAF2FF] disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onSaveAndReturn} disabled={saving}
              className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : "Save & return to event"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// BrandKitSelector — 6 curated Brand Kits + Custom marker.
// ============================================================================
function BrandKitSelector({
  value, onApplyKit, onClear, disabled,
}: {
  value: string;
  onApplyKit: (kit: BrandKit) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold">Pick a Brand Kit</div>
          <p className="mt-1 text-xs text-muted-foreground">
            A Brand Kit fills every colour field below in one click. Editing any
            colour afterwards flips this event to <span className="font-medium">Custom</span> — your
            edits are preserved. Existing events without a Brand Kit keep their
            current look.
          </p>
        </div>
        {value && !disabled && (
          <button type="button" onClick={onClear}
            className="text-[11px] text-muted-foreground underline hover:text-foreground">
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {BRAND_KITS.map((kit) => (
          <BrandKitCard key={kit.key} kit={kit} active={kit.key === value}
            disabled={disabled} onApply={() => onApplyKit(kit)} />
        ))}
        <div className={`flex flex-col gap-2 rounded-[12px] border p-2 text-left ${
          value === "custom" ? "border-[#2F6FE4] ring-2 ring-[#2F6FE4]/30" : "border-[#D9E2EF]"
        }`}>
          <div className="flex h-[78px] items-center justify-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-2xl" aria-hidden>🎨</div>
          <div>
            <div className="text-sm font-semibold text-[#111827]">Custom</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Set automatically once you hand-edit any colour. Pick a kit above to restart from a curated base.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandKitCard({
  kit, active, disabled, onApply,
}: {
  kit: BrandKit;
  active: boolean;
  disabled?: boolean;
  onApply: () => void;
}) {
  const c = kit.colors;
  return (
    <button type="button" onClick={onApply} disabled={disabled} aria-pressed={active}
      className={`group flex flex-col gap-2 rounded-[12px] border p-2 text-left transition disabled:opacity-50 ${
        active ? "border-[#2F6FE4] ring-2 ring-[#2F6FE4]/30" : "border-[#D9E2EF] hover:border-[#94A3B8]"
      }`}>
      <div className="overflow-hidden rounded-[8px] border" style={{ backgroundColor: c.page_background_color, borderColor: c.border_color }}>
        <div className="flex h-5 items-center justify-center text-[8px] font-semibold uppercase tracking-[0.18em]"
          style={{ backgroundColor: c.nav_background_color, color: c.nav_fg_color }}>
          Header
        </div>
        <div className="space-y-1.5 p-2">
          <div className="rounded-[4px] px-1.5 py-1" style={{ backgroundColor: c.card_background_color, border: `1px solid ${c.card_border_color}` }}>
            <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: c.card_text_color }} />
            <div className="mt-1 h-1 w-16 rounded-full" style={{ backgroundColor: c.card_muted_text_color, opacity: 0.8 }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
              style={{ backgroundColor: c.button_primary_bg, color: c.button_primary_fg }}>Button</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.accent_color }} aria-hidden />
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#111827]">{kit.label}</div>
          {active && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2F6FE4]">Selected</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{kit.description}</div>
      </div>
    </button>
  );
}

// ============================================================================
// Shared form atoms
// ============================================================================
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#334155]">{label}</span>
      {children}
    </label>
  );
}

function ColorRoleRow({
  label, helper, resolved, value, onChange, disabled, warnings,
}: {
  label: string;
  helper: string;
  resolved: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  warnings?: string[];
}) {
  const inherited = !value;
  const displayValue = value || resolved || "";
  const pickerValue = HEX_RE.test(value) ? value : (HEX_RE.test(resolved) ? resolved : "#000000");
  const [text, setText] = useState(displayValue);
  const [flash, setFlash] = useState(false);

  // Keep the local text in sync when the committed value/resolved fallback
  // changes from outside (Brand Kit apply, Reset, initial load).
  useEffect(() => {
    setText(displayValue);
  }, [displayValue]);

  const commit = (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (t === "") { onChange(""); return; }
    if (HEX_RE.test(t)) { onChange(t); return; }
    // Invalid — revert and flash red border briefly.
    setText(displayValue);
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[#334155]">{label}</span>
        <div className="flex items-center gap-2">
          {inherited && (
            <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
              Inherited
            </span>
          )}
          {value && !disabled && (
            <button type="button" onClick={() => onChange("")}
              className="text-[11px] text-muted-foreground underline hover:text-foreground">
              Reset
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onInput={(e) => onChange((e.target as HTMLInputElement).value.toUpperCase())}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          placeholder={resolved}
          disabled={disabled}
          maxLength={7}
          className={`h-10 flex-1 rounded-[10px] border bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            flash ? "border-[#DC2626] ring-2 ring-[#DC2626]/20" : "border-[#D9E2EF] focus:border-[#2F6FE4]"
          } ${inherited ? "text-[#64748B]" : ""}`}
        />
      </div>
      {warnings && warnings.length > 0 && (
        <div role="alert" className="space-y-1 rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] leading-5 text-[#92400E]">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
    </div>
  );

}

function surfaceWarning(fg: string, bg: string, surfaceLabel: string, threshold = 4.5): string | null {
  const ratio = contrastRatio(fg, bg);
  if (ratio == null || ratio >= threshold) return null;
  return `Low contrast on ${surfaceLabel} (${ratio.toFixed(2)}:1, needs ≥${threshold}:1).`;
}

function warn(fg: string, bg: string, label: string, threshold = 4.5): string[] | undefined {
  const w = surfaceWarning(fg, bg, label, threshold);
  return w ? [w] : undefined;
}

function countWarnings(theme: ReturnType<typeof resolveEventTheme>, group: "page" | "card" | "button" | "nav"): number {
  let n = 0;
  if (group === "page") {
    if (surfaceWarning(theme.pageText, theme.pageBg, "page bg")) n++;
    if (surfaceWarning(theme.pageMuted, theme.pageBg, "page bg", 3)) n++;
  } else if (group === "card") {
    if (surfaceWarning(theme.cardText, theme.cardBg, "card bg")) n++;
    if (surfaceWarning(theme.cardMuted, theme.cardBg, "card bg", 3)) n++;
  } else if (group === "button") {
    if (surfaceWarning(theme.buttonPrimaryFg, theme.buttonPrimaryBg, "primary button")) n++;
    if (surfaceWarning(theme.buttonSecondaryFg, theme.buttonSecondaryBg, "secondary button")) n++;
  } else if (group === "nav") {
    if (surfaceWarning(theme.navText, theme.navBg, "nav bg")) n++;
    if (surfaceWarning(theme.navActiveText, theme.navBg, "nav bg", 3)) n++;
  }
  return n;
}

// ============================================================================
// CollapsibleSection
// ============================================================================
function CollapsibleSection({
  id, title, subtitle, warningCount, expanded, onToggle, children,
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
      <button type="button" onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        aria-expanded={expanded} aria-controls={`section-${id}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#111827]">{title}</span>
            {!!warningCount && (
              <span className="inline-flex h-5 items-center rounded-full bg-[#FEF2F2] px-1.5 text-[11px] font-semibold text-[#B91C1C]"
                title={`${warningCount} contrast warning${warningCount > 1 ? "s" : ""}`}>
                {warningCount}
              </span>
            )}
          </div>
          {!expanded && subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <ChevronDown size={18} className={`shrink-0 text-[#64748B] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div id={`section-${id}`} className="border-t border-[#E6ECF4] px-6 pb-6 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HeroOverlayCard — overlay colour + opacity slider for the hero image fade.
// ============================================================================
function HeroOverlayCard({
  colorValue, opacityValue, primaryFallback, disabled, onColorChange, onOpacityChange,
}: {
  colorValue: string;
  opacityValue: string;
  primaryFallback: string;
  disabled?: boolean;
  onColorChange: (v: string) => void;
  onOpacityChange: (v: string) => void;
}) {
  const opacityNum = opacityValue ? Math.max(0, Math.min(100, Number(opacityValue) || 0)) : null;
  const pickerValue = HEX_RE.test(colorValue) ? colorValue : (HEX_RE.test(primaryFallback) ? primaryFallback : "#1F3D2B");
  return (
    <div className="space-y-3 rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] p-4">
      <div>
        <div className="text-sm font-semibold">Hero image overlay</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional tint painted on top of the cover image so the title stays readable.
        </p>
      </div>
      <Field label="Overlay colour">
        <div className="flex items-center gap-2">
          <input type="color" value={pickerValue}
            onInput={(e) => onColorChange((e.target as HTMLInputElement).value.toUpperCase())}
            onChange={(e) => onColorChange(e.target.value.toUpperCase())} disabled={disabled}
            className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50" />

          <input type="text" value={colorValue} onChange={(e) => onColorChange(e.target.value)}
            placeholder="(uses primary colour)" disabled={disabled} maxLength={7}
            className="h-10 flex-1 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50" />
          {colorValue && !disabled && (
            <button type="button" onClick={() => onColorChange("")}
              className="text-[11px] text-muted-foreground underline hover:text-foreground">Reset</button>
          )}
        </div>
      </Field>
      <Field label={`Overlay opacity${opacityNum != null ? ` — ${opacityNum}%` : " — default gradient"}`}>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={90} step={5} value={opacityNum ?? 50}
            onChange={(e) => onOpacityChange(e.target.value)} disabled={disabled} className="h-10 flex-1" />
          {opacityValue && !disabled && (
            <button type="button" onClick={() => onOpacityChange("")}
              className="text-[11px] text-muted-foreground underline hover:text-foreground">Use default</button>
          )}
        </div>
      </Field>
    </div>
  );
}

// ============================================================================
// FontPickers — separate heading + body font dropdowns.
// ============================================================================
function FontSelect({
  value, onChange, disabled, label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const selected = getEventFont(value);
  const isUnknown = !selected && value.trim().length > 0;
  const selectValue = selected ? selected.value : isUnknown ? "__unknown__" : "__default__";
  const triggerStack = selected?.stack;
  return (
    <Field label={label}>
      <Select
        value={selectValue}
        onValueChange={(n) => {
          if (n === "__unknown__") return;
          onChange(n === "__default__" ? "" : n);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          className="h-10 w-full rounded-[10px] border-[#D9E2EF] bg-white px-3 text-sm text-[#111827]"
          style={triggerStack ? { fontFamily: triggerStack } : undefined}
        >
          <SelectValue placeholder="Default (GetStampd)" />
        </SelectTrigger>
        <SelectContent className="max-h-[360px]">
          <SelectItem value="__default__">Default (GetStampd)</SelectItem>
          {isUnknown && (
            <SelectItem value="__unknown__" disabled>
              {value.trim()} (unavailable — pick a font below)
            </SelectItem>
          )}
          {(["Display", "Serif", "Sans", "Script"] as const).map((cat) => {
            const fonts = EVENT_FONTS.filter((f) => f.category === cat);
            if (fonts.length === 0) return null;
            return (
              <SelectGroup key={cat}>
                <SelectLabel>{cat}</SelectLabel>
                {fonts.map((f) => (
                  <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.stack }}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </Field>
  );
}

function FontPickers({
  headingValue, bodyValue, emotiveValue, onHeadingChange, onBodyChange, onEmotiveChange, disabled, eventName,
}: {
  headingValue: string;
  bodyValue: string;
  emotiveValue: string;
  onHeadingChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onEmotiveChange: (v: string) => void;
  disabled?: boolean;
  eventName: string;
}) {
  const headingStack =
    getEventFont(headingValue)?.stack ?? (headingValue.trim() || undefined);
  const bodyStack =
    getEventFont(bodyValue)?.stack ?? (bodyValue.trim() || undefined);
  const emotiveStack =
    getEventFont(emotiveValue)?.stack ?? (emotiveValue.trim() || "'Caveat', 'Segoe Script', cursive");
  // Heading font falls back to body font when unset.
  const heroPreviewStack = headingStack ?? bodyStack;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-[#111827]">Event heading font</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Used for the main event name over hero images. Leave on <span className="font-medium">Default</span> to inherit the body font.
        </p>
      </div>
      <FontSelect
        label="Heading font"
        value={headingValue}
        onChange={onHeadingChange}
        disabled={disabled}
      />

      <div className="pt-2">
        <div className="text-sm font-semibold text-[#111827]">Body font</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Used for buttons, cards, venue text, offers, FAQ, terms and most page content.
        </p>
      </div>
      <FontSelect
        label="Body font"
        value={bodyValue}
        onChange={onBodyChange}
        disabled={disabled}
      />

      <div className="pt-2">
        <div className="text-sm font-semibold text-[#111827]">Venue emotive font (default)</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Script font used to render the optional emotive/storytelling block on each venue page.
          Individual venues can override this. Defaults to <span className="font-medium">Caveat</span>.
        </p>
      </div>
      <FontSelect
        label="Default emotive font"
        value={emotiveValue}
        onChange={onEmotiveChange}
        disabled={disabled}
      />

      <div className="space-y-3 rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] p-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#64748B]">Font preview</div>
        <div style={heroPreviewStack ? { fontFamily: heroPreviewStack } : undefined}>
          <div className="text-3xl font-semibold leading-tight text-[#111827]">
            {eventName || "Explore Orange Wine Trail"}
          </div>
        </div>
        <div style={{ fontFamily: emotiveStack }}>
          <p className="text-2xl leading-snug text-[#334155]">
            A little story worth savouring.
          </p>
        </div>
        <div style={bodyStack ? { fontFamily: bodyStack } : undefined}>
          <p className="text-sm leading-6 text-[#334155]">
            Collect stamps as you visit participating venues and unlock rewards along the way.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-[8px] bg-[#2F6FE4] px-3 text-[12px] font-semibold text-white">
              Sample button
            </span>
            <span className="text-[12px] text-[#64748B]">Card and interface text</span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// SemanticPreview — sample UI drawn entirely from --event-* tokens.
// ============================================================================
function SemanticPreview({ venueLabelPlural }: { venueLabelPlural: string }) {
  return (
    <div className="mt-4 space-y-3 rounded-[12px] p-3"
      style={{ backgroundColor: "var(--event-page-bg)", border: "1px solid var(--event-border)" }}>
      <div className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: "var(--event-page-muted)" }}>
        Semantic tokens preview
      </div>
      <div>
        <h4 className="text-base font-semibold" style={{ color: "var(--event-page-fg)" }}>Sample heading</h4>
        <p className="text-sm" style={{ color: "var(--event-page-fg)" }}>This body paragraph uses the page text colour.</p>
        <p className="text-xs" style={{ color: "var(--event-page-muted)" }}>This is muted helper text.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex h-9 items-center rounded-[10px] px-3 text-xs font-semibold"
          style={{ backgroundColor: "var(--event-button-primary-bg)", color: "var(--event-button-primary-fg)" }}>
          Primary button
        </button>
        <button type="button" className="inline-flex h-9 items-center rounded-[10px] border px-3 text-xs font-semibold"
          style={{ backgroundColor: "var(--event-button-secondary-bg)", color: "var(--event-button-secondary-fg)", borderColor: "var(--event-card-border)" }}>
          Secondary button
        </button>
      </div>
      <div className="rounded-[10px] p-3"
        style={{ backgroundColor: "var(--event-card-bg)", border: "1px solid var(--event-card-border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--event-card-fg)" }}>Sample card</div>
        <div className="text-xs" style={{ color: "var(--event-card-muted)" }}>
          Sample {venueLabelPlural.toLowerCase().replace(/s$/, "")} address goes here.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-[10px] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ background: "var(--event-nav-bg)", color: "var(--event-nav-muted)" }}>
        <span className="text-center" style={{ color: "var(--event-nav-fg)" }}>Home</span>
        <span className="text-center" style={{ color: "var(--event-nav-active-fg)" }}>Map</span>
        <span className="text-center">More</span>
      </div>
    </div>
  );
}

// ============================================================================
// AssetUploader
// ============================================================================
function AssetUploader({
  kind, currentPath, canEdit, onUpload, onRemove,
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
  const helper = kind === "logo"
    ? "Shown in the header of your event page. Square images look best."
    : "Wide hero image shown at the top of your event page.";
  const limitMB = Math.round(EVENT_ASSET_MAX_BYTES[kind] / (1024 * 1024));
  const accept = EVENT_ASSET_ALLOWED_MIME.join(",");
  const disabled = !canEdit || busy || removing;

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setErr(null); setBusy(true);
    const result = await onUpload(file);
    setBusy(false);
    if (result) setErr(result);
    if (inputRef.current) inputRef.current.value = "";
  }
  async function handleRemove() {
    if (!url) return;
    const ok = window.confirm(`Remove the ${kind === "logo" ? "logo" : "cover image"}?`);
    if (!ok) return;
    setErr(null); setRemoving(true);
    const result = await onRemove();
    setRemoving(false);
    if (result) setErr(result);
  }
  const previewClass = kind === "logo" ? "h-28 w-28 rounded-[12px]" : "aspect-[16/9] w-full rounded-[12px]";

  return (
    <div className="space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-base font-semibold text-[#111827]">{label}</div>
        <div className="text-[11px] text-[#64748B]">PNG, JPG, WebP · max {limitMB} MB</div>
      </div>
      <p className="text-sm leading-6 text-[#64748B]">{helper}</p>
      <div className={`rounded-[16px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 ${url ? "" : "text-center"}`}>
        {url ? (
          <div className={`relative mx-auto flex items-center justify-center overflow-hidden border border-[#E6ECF4] bg-white ${previewClass}`}>
            <img src={url} alt={`${label} preview`} className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
        ) : (
          <div className="text-sm text-[#475569]">No {kind === "logo" ? "logo" : "cover image"} uploaded yet.</div>
        )}
      </div>
      {err && (
        <div className="rounded-[12px] border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">{err}</div>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden" disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])} />
      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
            className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Uploading…" : url ? `Replace ${kind}` : `Upload ${kind}`}
          </button>
          {url && (
            <button type="button" onClick={handleRemove} disabled={disabled}
              className="h-10 rounded-[10px] border border-[#FDA4AF] bg-white px-4 text-sm font-semibold text-[#E11D48] hover:bg-[#FFF1F2] disabled:cursor-not-allowed disabled:opacity-50">
              {removing ? "Removing…" : `Remove ${kind}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
