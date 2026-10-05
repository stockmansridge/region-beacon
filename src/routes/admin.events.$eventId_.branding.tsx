import { V2ResultPreview, RESULT_PAGE_STATES, type ResultPreviewPage } from "@/components/v2-result-previews";
import { ChevronDown, Info, Monitor, Redo2, Smartphone, Undo2, X } from "lucide-react";
import { loadV2PreviewContent, loadV2PreviewVenueExtras, previewHasMap, type V2PreviewContent, type V2PreviewVenueExtras } from "@/lib/v2-preview-content";
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
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/placeholder";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { normalizeWebsiteUrl } from "@/lib/normalize-url";
import { useAgencyContext } from "@/hooks/use-agency-context";
import {
  type PublicEventData,
  type PublicVenueData,
} from "@/components/event-public-landing";
import { PublicEventTemplate } from "@/components/public-event-template";
import { PublicVenuesListPage, type VenueRow as ListVenueRow } from "@/routes/live.$subdomain.venues.index";
import { PublicVenueDetailPage, type VenueRow as DetailVenueRow } from "@/routes/live.$subdomain.venues.$venueId";
import { PublicOffersPage, type OfferVenue } from "@/routes/live.$subdomain.offers";
import { LiveJoinPage, type JoinPreviewEvent, type JoinPreviewState } from "@/routes/live.$subdomain.join";
import { AwardsPage } from "@/routes/live.$subdomain.prizes";
import { PublicTrailMapPage, type MapEventRow } from "@/routes/live.$subdomain.map";
import { PublicLeaderboardPage } from "@/routes/live.$subdomain.leaderboard";
import { FaqPage } from "@/routes/live.$subdomain.faq";
import { PublicBookmarksPage } from "@/routes/live.$subdomain.bookmarks";
import { CombinedLegalPage, type LegalRow } from "@/components/public-legal";
import { PassportPreview, type PassportRow } from "@/routes/passport.$token";
import { normalizePassportStampRows } from "@/lib/passport-stamps";
import { brandingScopeProps, resolveEventBrandingKeys } from "@/lib/use-event-palette";
import { PublicNavProvider } from "@/components/public-nav-context";
import type { PublicBrandingEvent } from "@/components/public-event-branding-scope";
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
import { EVENT_BRANDING_SELECT, EVENT_BRANDING_SELECT_FALLBACK } from "@/lib/event-branding-theme";
import { resolvePublicLandingCopy } from "@/lib/public-landing-copy";
import { resolveEventTheme } from "@/lib/event-theme";
import { contrastRatio } from "@/lib/contrast";
import {
  EVENT_FONTS,
  buildGoogleFontsHref,
  getEventFont,
  isSupportedEventFont,
} from "@/lib/event-fonts";
import {
  CUSTOM_FONT_MAX_BYTES,
  customFontStack,
  deleteEventCustomFont,
  listEventCustomFonts,
  registerCustomFonts,
  suggestFamilyName,
  uploadEventCustomFont,
  type EventCustomFont,
} from "@/lib/event-custom-fonts";
import {
  BRAND_KITS,
  BRAND_KIT_VERSION,
  type BrandKit,
  type BrandKitKey,
  getBrandKit,
} from "@/lib/event-brand-kits";
import {
  PUBLIC_STYLE_ELEMENTS,
  DEFAULT_PUBLIC_NAVIGATION,
  PUBLIC_NAV_ICON_IDS,
  emptyPublicStyleOverrides,
  parsePublicStyleOverrides,
  resolvePublicTemplateVersion,
  validatePublicStyleOverrides,
  publicStylePropertyValue,
  type PublicStyleElementId,
  type PublicStyleElementDefinition,
  type PublicStyleOverrideDocument,
  type PublicStyleProperty,
  type PublicNavIconId,
  type PublicV2ThemeKey,
} from "@/lib/public-style-overrides";

export const Route = createFileRoute("/admin/events/$eventId_/branding")({
  validateSearch: z.object({ editor: z.enum(["v2"]).optional() }),
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
  description: string | null;
  status: string;
};

type Branding = {
  logo_path: string | null;
  cover_path: string | null;
  cover_focal_x: number | null;
  cover_focal_y: number | null;
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
  hero_body_color: string | null;
  hero_overlay_color: string | null;
  hero_overlay_opacity: number | null;
  // Event logo presentation (over the hero image + on posters)
  logo_shape: string | null;
  logo_backdrop: string | null;
  logo_backdrop_color: string | null;
  // Optional custom public menu item
  custom_link_label: string | null;
  custom_link_url: string | null;
  custom_link_enabled: boolean | null;

  // Brand Kit metadata
  brand_kit_key: string | null;
  brand_kit_version: number | null;

  // Retained but no longer editable from the admin UI
  palette_key: string | null;
  page_background_key: string | null;
  public_template_version?: string | null;
  v2_style_config?: PublicStyleOverrideDocument | null;
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
  venues: PublicVenueData[];
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
  hero_body_color: string;
  hero_overlay_color: string;
  hero_overlay_opacity: string; // empty = default gradient
  // Cover focal point (0–100, "" → default 50 centered).
  cover_focal_x: string;
  cover_focal_y: string;
  // Event logo presentation. "" → defaults (square / transparent).
  logo_shape: string;
  logo_backdrop: string;
  logo_backdrop_color: string;
  // Optional custom public menu item
  custom_link_label: string;
  custom_link_url: string;
  custom_link_enabled: boolean;
  style_overrides: PublicStyleOverrideDocument;
};

type VisualBrandRole =
  | "brand"
  | "fonts"
  | "logo"
  | "cover"
  | "hero"
  | "heroHeading"
  | "welcome"
  | "page"
  | "pageHeading"
  | "pageBody"
  | "pageMuted"
  | "cards"
  | "cardHeading"
  | "cardBody"
  | "cardMuted"
  | "primaryButtons"
  | "secondaryButtons"
  | "navigation"
  | "navActive"
  | "navMuted"
  | "links";

type EditorSelection = VisualBrandRole | PublicStyleElementId;

type ColourField = Extract<keyof Form,
  | "primary_color" | "accent_color" | "link_color"
  | "page_background_color" | "page_heading_color" | "page_body_color" | "page_muted_color" | "border_color"
  | "card_background_color" | "card_heading_color" | "card_body_color" | "card_muted_color" | "card_border_color"
  | "button_primary_bg" | "button_primary_fg" | "button_secondary_bg" | "button_secondary_fg"
  | "nav_background_color" | "nav_fg_color" | "nav_muted_color" | "nav_active_fg_color"
  | "hero_bg_color" | "hero_fg_color" | "hero_accent_color" | "hero_body_color" | "hero_overlay_color"
  | "logo_backdrop_color"
>;

const VISUAL_ROLE_META: Record<VisualBrandRole, {
  label: string;
  description: string;
  fields: ColourField[];
}> = {
  brand: { label: "Brand colours", description: "Shared brand defaults used across public pages and posters.", fields: ["primary_color", "accent_color"] },
  fonts: { label: "Fonts", description: "Heading and body fonts are shared across the event’s public experience.", fields: [] },
  logo: { label: "Logo", description: "Image changes save immediately. Shape and backdrop settings save with the form.", fields: ["logo_backdrop_color"] },
  cover: { label: "Hero / Cover", description: "Image changes save immediately. Position and overlay settings save with the form.", fields: ["hero_bg_color", "hero_overlay_color"] },
  hero: { label: "Hero / Cover", description: "Applies to the hero surface, cover overlay and accent label.", fields: ["hero_bg_color", "hero_accent_color", "hero_overlay_color"] },
  heroHeading: { label: "Event heading", description: "Applies to the event heading. The heading font is shared across event headings.", fields: ["hero_fg_color"] },
  welcome: { label: "Welcome message", description: "Edits the existing welcome message and its colour. The body font is shared globally.", fields: ["hero_body_color"] },
  page: { label: "Page", description: "Applies to the public page surface and its dividers.", fields: ["page_background_color", "border_color"] },
  pageHeading: { label: "Page headings", description: "Applies to all headings displayed on the page surface.", fields: ["page_heading_color"] },
  pageBody: { label: "Page body", description: "Applies to standard copy displayed on the page surface.", fields: ["page_body_color"] },
  pageMuted: { label: "Page muted text", description: "Applies to helper text and metadata on the page surface.", fields: ["page_muted_color"] },
  cards: { label: "Cards", description: "Applies to all card surfaces and borders.", fields: ["card_background_color", "card_border_color"] },
  cardHeading: { label: "Card headings", description: "Applies to headings and key values inside all cards.", fields: ["card_heading_color"] },
  cardBody: { label: "Card body", description: "Applies to standard copy inside all cards.", fields: ["card_body_color"] },
  cardMuted: { label: "Card muted text", description: "Applies to card metadata, captions and progress labels.", fields: ["card_muted_color"] },
  primaryButtons: { label: "Primary buttons", description: "Applies to all primary buttons and progress accents.", fields: ["button_primary_bg", "button_primary_fg"] },
  secondaryButtons: { label: "Secondary buttons", description: "Applies to all secondary button surfaces and text.", fields: ["button_secondary_bg", "button_secondary_fg"] },
  navigation: { label: "Navigation", description: "Applies to the top bar, bottom menu and menu drawer.", fields: ["nav_background_color", "nav_fg_color"] },
  navActive: { label: "Active navigation", description: "Applies to the currently selected navigation item.", fields: ["nav_active_fg_color"] },
  navMuted: { label: "Muted navigation", description: "Applies to inactive and subtle navigation items.", fields: ["nav_muted_color"] },
  links: { label: "Links", description: "Applies to text links across the public event pages.", fields: ["link_color"] },
};

const VISUAL_NAV: Array<{ label: string; role: VisualBrandRole }> = [
  { label: "Brand Kit", role: "brand" }, { label: "Brand colours", role: "brand" },
  { label: "Fonts", role: "fonts" }, { label: "Logo", role: "logo" },
  { label: "Hero / Cover", role: "cover" }, { label: "Event heading", role: "heroHeading" },
  { label: "Welcome message", role: "welcome" }, { label: "Page", role: "page" },
  { label: "Cards", role: "cards" }, { label: "Primary buttons", role: "primaryButtons" },
  { label: "Secondary buttons", role: "secondaryButtons" }, { label: "Navigation", role: "navigation" },
  { label: "Links", role: "links" },
];

const COLOUR_LABELS: Record<ColourField, string> = {
  primary_color: "Primary colour", accent_color: "Accent colour", link_color: "Link colour",
  page_background_color: "Page background", page_heading_color: "Page heading", page_body_color: "Page body",
  page_muted_color: "Page muted text", border_color: "Page border", card_background_color: "Card background",
  card_heading_color: "Card heading", card_body_color: "Card body", card_muted_color: "Card muted text",
  card_border_color: "Card border", button_primary_bg: "Primary button background", button_primary_fg: "Primary button text",
  button_secondary_bg: "Secondary button background", button_secondary_fg: "Secondary button text",
  nav_background_color: "Navigation background", nav_fg_color: "Navigation text", nav_muted_color: "Navigation muted",
  nav_active_fg_color: "Navigation active", hero_bg_color: "Hero background", hero_fg_color: "Event heading",
  hero_accent_color: "Hero accent", hero_body_color: "Welcome message", hero_overlay_color: "Hero overlay",
  logo_backdrop_color: "Logo backdrop",
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
  hero_body_color: "",
  hero_overlay_color: "",
  hero_overlay_opacity: "",
  cover_focal_x: "",
  cover_focal_y: "",
  logo_shape: "",
  logo_backdrop: "",
  logo_backdrop_color: "",
  custom_link_label: "",
  custom_link_url: "",
  custom_link_enabled: false,
  style_overrides: emptyPublicStyleOverrides(),
};

/** Form keys that, when edited, should flip brand_kit_key to "custom". */
const COLOUR_FORM_KEYS: ReadonlyArray<keyof Form> = [
  "primary_color", "accent_color", "link_color",
  "page_background_color", "page_heading_color", "page_body_color", "page_muted_color", "border_color",
  "card_background_color", "card_heading_color", "card_body_color", "card_muted_color", "card_border_color",
  "button_primary_bg", "button_primary_fg", "button_secondary_bg", "button_secondary_fg",
  "nav_background_color", "nav_fg_color", "nav_muted_color", "nav_active_fg_color",
  "hero_bg_color", "hero_fg_color", "hero_accent_color", "hero_body_color",
];

// Canonical branding column list — shared with the admin full-preview route so
// the two surfaces can never drift.
const SELECT_COLS = EVENT_BRANDING_SELECT;
const SELECT_COLS_FALLBACK = EVENT_BRANDING_SELECT_FALLBACK;



function brandingToForm(b: Branding | null): Form {
  if (!b) return EMPTY_FORM;
  const v2 = parsePublicStyleOverrides(b.v2_style_config);
  const base: Form = {
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
    hero_body_color: b.hero_body_color ?? "",
    hero_overlay_color: b.hero_overlay_color ?? "",
    hero_overlay_opacity:
      b.hero_overlay_opacity != null ? String(b.hero_overlay_opacity) : "",
    cover_focal_x: b.cover_focal_x != null ? String(b.cover_focal_x) : "",
    cover_focal_y: b.cover_focal_y != null ? String(b.cover_focal_y) : "",
    logo_shape: b.logo_shape ?? "",
    logo_backdrop: b.logo_backdrop ?? "",
    logo_backdrop_color: b.logo_backdrop_color ?? "",
    custom_link_label: b.custom_link_label ?? "",
    custom_link_url: b.custom_link_url ?? "",
    custom_link_enabled: Boolean(b.custom_link_enabled),
    style_overrides: v2,
  };
  return base;
}

/**
 * V2 draft form: the V1 values as the inherited starting point, with this
 * event's stored V2 theme layered on top. Kept in a SEPARATE state from the
 * classic (V1) form so V2 values can never be saved into V1 columns.
 */
/**
 * The ONE mapping from (immutable event row, saved branding row, form values)
 * to the public PublicEventData contract. Used for the unsaved draft (current
 * form) and for the saved baseline (brandingToV2Form(saved branding)), so the
 * saved view can never pick up unsaved edits or miss a field.
 */
export function formToPreviewEvent(
  event: { id: string; name: string; public_slug?: string | null; description?: string | null },
  branding: Branding | null,
  form: Form,
  publicBase?: Record<string, unknown> | null,
): PublicEventData & { public_template_version?: string | null; v2_style_config?: PublicStyleOverrideDocument | null; default_emotive_font_family?: string | null } {
  const orNullHex = (v: string) => (v.trim() ? v.trim() : null);
  return {
    ...(publicBase ?? {}),
    event_id: event.id,
    name: event.name,
    public_slug: event.public_slug ?? "",
    description: event.description ?? null,
    starts_at: (publicBase?.starts_at as string | null | undefined) ?? null,
    ends_at: (publicBase?.ends_at as string | null | undefined) ?? null,
    timezone: (publicBase?.timezone as string | null | undefined) ?? null,
    logo_path: branding?.logo_path ?? null,
    cover_path: branding?.cover_path ?? null,
    cover_focal_x: form.cover_focal_x.trim() ? Number(form.cover_focal_x) : null,
    cover_focal_y: form.cover_focal_y.trim() ? Number(form.cover_focal_y) : null,
    primary_color: orNullHex(form.primary_color),
    accent_color: orNullHex(form.accent_color),
    palette_key: (publicBase?.palette_key as string | null | undefined) ?? null,
    page_background_key: (publicBase?.page_background_key as string | null | undefined) ?? null,
    page_background_color: orNullHex(form.page_background_color),
    card_background_color: orNullHex(form.card_background_color),
    text_color: orNullHex(form.page_heading_color),
    muted_text_color: orNullHex(form.page_muted_color),
    card_text_color: orNullHex(form.card_heading_color),
    card_muted_text_color: orNullHex(form.card_muted_color),
    border_color: orNullHex(form.border_color),
    primary_text_color: orNullHex(form.button_primary_fg),
    nav_background_color: orNullHex(form.nav_background_color),
    font_family: getEventFont(form.font_family)?.stack ?? (form.font_family.trim() || null),
    heading_font_family:
      getEventFont(form.heading_font_family)?.stack ?? (form.heading_font_family.trim() || null),
    default_emotive_font_family: form.default_emotive_font_family.trim() || null,
    welcome_copy: form.welcome_copy.trim() || null,
    terms_url: orNullHex(form.terms_url),
    current_terms_version_id: (publicBase?.current_terms_version_id as string | null | undefined) ?? null,
    venue_label_singular: form.venue_label_singular || null,
    venue_label_plural: form.venue_label_plural || null,
    hero_overlay_color: orNullHex(form.hero_overlay_color),
    hero_overlay_opacity: form.hero_overlay_opacity.trim()
      ? Number(form.hero_overlay_opacity)
      : null,
    brand_kit_key: form.brand_kit_key || null,
    link_color: orNullHex(form.link_color),
    card_border_color: orNullHex(form.card_border_color),
    button_primary_bg: orNullHex(form.button_primary_bg),
    button_primary_fg: orNullHex(form.button_primary_fg),
    button_secondary_bg: orNullHex(form.button_secondary_bg),
    button_secondary_fg: orNullHex(form.button_secondary_fg),
    nav_fg_color: orNullHex(form.nav_fg_color),
    nav_muted_color: orNullHex(form.nav_muted_color),
    nav_active_fg_color: orNullHex(form.nav_active_fg_color),
    hero_bg_color: orNullHex(form.hero_bg_color),
    hero_fg_color: orNullHex(form.hero_fg_color),
    hero_accent_color: orNullHex(form.hero_accent_color),
    hero_body_color: orNullHex(form.hero_body_color),
    logo_shape: orNullHex(form.logo_shape),
    logo_backdrop: orNullHex(form.logo_backdrop),
    logo_backdrop_color:
      form.logo_backdrop === "color" ? orNullHex(form.logo_backdrop_color) : null,
    page_heading_color: orNullHex(form.page_heading_color),
    page_body_color: orNullHex(form.page_body_color),
    page_muted_color: orNullHex(form.page_muted_color),
    card_heading_color: orNullHex(form.card_heading_color),
    card_body_color: orNullHex(form.card_body_color),
    card_muted_color: orNullHex(form.card_muted_color),
    style_overrides: form.style_overrides,
    public_template_version: branding?.public_template_version ?? null,
    v2_style_config: form.style_overrides,
  };
}

function brandingToV2Form(b: Branding | null): Form {
  const base = brandingToForm(b);
  if (!b) return base;
  const v2 = base.style_overrides;
  for (const [key, value] of Object.entries(v2.theme ?? {})) {
    if (key in base && key !== "style_overrides") {
      // null = explicit V2 clear; the form models "cleared" as "".
      (base as unknown as Record<string, unknown>)[key] = value == null ? "" : String(value);
    }
  }
  return base;
}

function BrandingEditor() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const canEdit =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  // Surfaced in the error view so a load failure is diagnosable instead of
  // showing only "Could not load this event".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Two independent drafts: classic edits V1 columns, V2 edits only v2_style_config.
  const [v1Form, setV1Form] = useState<Form>(EMPTY_FORM);
  const [v2Form, setV2Form] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"classic" | "v2">(
    search.editor === "v2" ? "v2" : "classic",
  );
  const [selectedRole, setSelectedRole] = useState<EditorSelection | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"mobile" | "desktop">("mobile");
  const [recentColours, setRecentColours] = useState<string[]>([]);

  useEffect(() => {
    setEditorMode(search.editor === "v2" ? "v2" : "classic");
  }, [search.editor]);

  // Every handler below operates on the ACTIVE draft for the current mode.
  const form = editorMode === "v2" ? v2Form : v1Form;
  const setForm = editorMode === "v2" ? setV2Form : setV1Form;

  const v1Dirty = bundle ? JSON.stringify(v1Form) !== JSON.stringify(brandingToForm(bundle.branding)) : false;
  const v2Dirty = bundle ? JSON.stringify(v2Form) !== JSON.stringify(brandingToV2Form(bundle.branding)) : false;
  const hasUnsavedChanges = v1Dirty || v2Dirty;

  const v2ConfigForDraft = () => {
    // Diff the V2 draft against the V1 values it inherits from: only real
    // differences become V2 theme overrides; equal values inherit again.
    const baseline = brandingToForm(bundle?.branding ?? null);
    const draft = v2Form;
    const theme = {} as Record<string, string | number | null>;
    const keys: Array<PublicV2ThemeKey & keyof Form> = [
      "font_family", "heading_font_family", "default_emotive_font_family", "welcome_copy",
      "primary_color", "accent_color", "link_color", "page_background_color", "page_heading_color",
      "page_body_color", "page_muted_color", "border_color", "card_background_color", "card_heading_color",
      "card_body_color", "card_muted_color", "card_border_color", "button_primary_bg", "button_primary_fg",
      "button_secondary_bg", "button_secondary_fg", "nav_background_color", "nav_fg_color", "nav_muted_color",
      "nav_active_fg_color", "hero_bg_color", "hero_fg_color", "hero_accent_color", "hero_body_color",
      "hero_overlay_color", "hero_overlay_opacity", "logo_shape", "logo_backdrop", "logo_backdrop_color",
      "cover_focal_x", "cover_focal_y",
    ];
    for (const key of keys) {
      if (draft[key] === baseline[key]) continue;
      const raw = draft[key];
      if (key === "hero_overlay_opacity" || key === "cover_focal_x" || key === "cover_focal_y") {
        theme[key] = String(raw).trim() ? Number(raw) : null;
      } else theme[key] = typeof raw === "string" && raw !== "" ? raw : null;
    }
    return parsePublicStyleOverrides({ ...draft.style_overrides, theme });
  };

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (editorMode !== "v2") return;
    const clearSelection = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRole(null);
    };
    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, [editorMode]);

  function changeEditorMode(mode: "classic" | "v2") {
    navigate({
      to: "/admin/events/$eventId/branding",
      params: { eventId },
      search: mode === "v2" ? { editor: "v2" } : {},
      replace: true,
    });
  }

  // Uploaded (custom) fonts for this event.
  const [customFonts, setCustomFonts] = useState<EventCustomFont[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await listEventCustomFonts(eventId);
      if (!alive) return;
      setCustomFonts(rows);
      registerCustomFonts(rows);
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  // Surface save results as toasts so you never have to scroll up to see them.
  useEffect(() => {
    if (saveSuccess) toast.success(saveSuccess);
  }, [saveSuccess]);
  useEffect(() => {
    if (saveError) {
      toast.error(saveError, { duration: 12000, closeButton: true });
    }
  }, [saveError]);
  useEffect(() => {
    if (validationError) {
      toast.error(validationError, { duration: 8000, closeButton: true });
    }
  }, [validationError]);


  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    logo: false,
    cover: false,
    kit: false,
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
      if (editorMode === "v2" && typeof value === "string") {
        next.style_overrides = parsePublicStyleOverrides({
          ...f.style_overrides,
          theme: { ...(f.style_overrides.theme ?? {}), [key as PublicV2ThemeKey]: value || null },
        });
      }
      if (COLOUR_FORM_KEYS.includes(key) && f.brand_kit_key && f.brand_kit_key !== "custom") {
        next.brand_kit_key = "custom";
      }
      return next;
    });
  }

  /** Apply a Brand Kit — overwrites every colour field. */
  function applyBrandKit(kit: BrandKit) {
    setForm((f) => {
      const colours = {
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
      // Kits have no dedicated hero body colour yet: inherit the hero foreground.
        hero_body_color: kit.colors.hero_fg_color,
      };
      return {
        ...f,
        ...colours,
        ...(editorMode === "v2" ? {
          style_overrides: parsePublicStyleOverrides({
            ...f.style_overrides,
            theme: { ...(f.style_overrides.theme ?? {}), ...colours },
          }),
        } : {}),
      };
    });
  }

  /** Select Custom without changing the current colours. */
  function selectCustomBrandKit() {
    setForm((f) => ({ ...f, brand_kit_key: "custom" }));
  }

  useEffect(() => {
    if (agency.status === "loading") return;
    if (!agencyId) {
      setState("error");
      return;
    }
    let cancelled = false;
    setState("loading");
    setLoadError(null);
    (async () => {
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select("id, agency_id, name, public_slug, status, description")
        .eq("id", eventId)
        .eq("agency_id", agencyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (evErr) { setState("error"); return; }
      if (!event) { setState("not-found"); return; }

      // Branding columns are added incrementally by production migrations, so
      // the read degrades: full list → base list → minimal list. A missing
      // column must never turn into "Could not load this event".
      const brandingSelect = async () => {
        const attempt = (cols: string) =>
          supabase
            .from("event_branding")
            .select(cols)
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .maybeSingle();

        const full = await attempt(SELECT_COLS);
        if (!full.error) return full;
        console.warn("[branding] full select failed:", full.error.message);

        const base = await attempt(SELECT_COLS_FALLBACK);
        if (!base.error) return base;
        console.warn("[branding] base select failed:", base.error.message);

        // Last resort: enough to render the editor with defaults rather than
        // blocking the whole page.
        return await attempt("logo_path, cover_path, font_family, primary_color, accent_color");
      };
      const [brandingRes, domainsRes, venuesRes] = await Promise.all([
        brandingSelect(),

        supabase
          .from("event_domains")
          .select("public_subdomain, custom_domain, domain_type, status, is_primary")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .order("is_primary", { ascending: false }),
        supabase
          .from("venues")
          .select("id, name, description, address, website_url, phone, logo_path, cover_path, lat, lng, offer_summary, offer_display_icon, offer_display_colour, offer_display_foreground_colour, points_value, order_index")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .eq("status", "active")
          .order("order_index", { ascending: true }),
      ]);
      if (cancelled) return;
      if (brandingRes.error || domainsRes.error || venuesRes.error) {
        const detail =
          brandingRes.error?.message ??
          domainsRes.error?.message ??
          venuesRes.error?.message ??
          null;
        console.error("[branding] load failed:", detail);
        setLoadError(detail);
        setState("error");
        return;
      }
      const branding = (brandingRes.data ?? null) as Branding | null;
      setBundle({
        event: event as EventRow,
        branding,
        domains: (domainsRes.data ?? []) as Domain[],
        venueCount: venuesRes.data?.length ?? 0,
        venues: ((venuesRes.data ?? []) as Array<{
          id: string;
          name: string;
          description: string | null;
          address: string | null;
          website_url: string | null;
          phone: string | null;
          logo_path: string | null;
          cover_path: string | null;
          lat: number | null;
          lng: number | null;
          offer_summary: string | null;
          offer_display_icon: string | null;
          offer_display_colour: string | null;
          offer_display_foreground_colour: string | null;
          points_value: number | null;
          order_index: number | null;
        }>).map((v) => ({
          venue_id: v.id,
          name: v.name,
          address: v.address,
          order_index: v.order_index,
          description: v.description,
          website_url: v.website_url,
          phone: v.phone,
          logo_path: v.logo_path,
          cover_path: v.cover_path,
          lat: v.lat,
          lng: v.lng,
          offer_summary: v.offer_summary,
          offer_display_icon: v.offer_display_icon,
          offer_display_colour: v.offer_display_colour,
          offer_display_foreground_colour: v.offer_display_foreground_colour,
          points_value: v.points_value,
        })),
        hasBranding: Boolean(brandingRes.data),
      });
      setV1Form(brandingToForm(branding));
      setV2Form(brandingToV2Form(branding));
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

  /** Adopt a confirmed V2 read-back as the new baseline for BOTH drafts' comparisons. */
  function applyConfirmedV2(confirmed: { public_template_version: string; v2_style_config: PublicStyleOverrideDocument }) {
    const savedConfig = parsePublicStyleOverrides(confirmed.v2_style_config);
    const nextBranding = { ...(bundle?.branding ?? {}), v2_style_config: savedConfig, public_template_version: confirmed.public_template_version } as Branding;
    setBundle((current) => current ? { ...current, branding: nextBranding, hasBranding: true } : current);
    setV2Form(brandingToV2Form(nextBranding));
  }

  type V2SaveResult =
    | { ok: true; confirmed: { public_template_version: string; v2_style_config: PublicStyleOverrideDocument } }
    | { ok: false; message: string };

  /**
   * Persist the V2 config atomically via the save_event_v2_branding RPC.
   * If the RPC is not installed yet (schema-cache miss), fall back to a direct
   * RLS-governed event_branding update with a confirmed read-back. If the V2
   * columns are missing too, report persistence as unavailable and keep the draft.
   */
  async function saveV2Branding(config: PublicStyleOverrideDocument, activate: boolean): Promise<V2SaveResult> {
    if (!bundle || !agencyId) return { ok: false, message: "The event is still loading." };
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Array<{ public_template_version: string; v2_style_config: PublicStyleOverrideDocument }> | null; error: { message: string; code?: string } | null }>;
    const { data, error } = await rpc("save_event_v2_branding", {
      _agency_id: agencyId,
      _event_id: bundle.event.id,
      _config: config,
      _activate: activate,
    });
    const confirmed = data?.[0];
    if (!error && confirmed?.v2_style_config) return { ok: true, confirmed };

    const missingRpc = !!error && (error.code === "PGRST202" || /schema cache|could not find the function/i.test(error.message));
    if (!missingRpc) {
      return { ok: false, message: error?.message ?? "Persistence is unavailable; your draft is still open." };
    }

    // Fallback: direct update through the existing table permissions.
    const updatePayload: Record<string, unknown> = { v2_style_config: config };
    if (activate) updatePayload.public_template_version = "v2";
    const { data: rows, error: updateError } = await (supabase.from("event_branding") as unknown as {
      update: (payload: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            select: (cols: string) => Promise<{ data: Array<{ public_template_version: string | null; v2_style_config: PublicStyleOverrideDocument | null }> | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
    }).update(updatePayload).eq("agency_id", agencyId).eq("event_id", bundle.event.id)
      .select("public_template_version, v2_style_config");

    const row = rows?.[0];
    if (updateError || !row?.v2_style_config) {
      const missingColumns = !!updateError && (updateError.code === "42703" || /column .* does not exist|schema cache/i.test(updateError.message));
      return {
        ok: false,
        message: missingColumns
          ? "The V2 database changes have not been applied to this environment yet, so V2 branding cannot be saved here. Your draft is still open and nothing was written."
          : updateError?.message ?? "Persistence is unavailable; your draft is still open.",
      };
    }
    return {
      ok: true,
      confirmed: {
        public_template_version: row.public_template_version === "v2" ? "v2" : "v1",
        v2_style_config: row.v2_style_config,
      },
    };
  }

  async function onSave(opts?: { returnAfter?: boolean }) {
    if (!bundle || !agencyId || !canEdit) return;
    // Clear previous messages so repeated identical results still re-toast.
    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(null);



    if (editorMode === "v2") {
      const checked = validatePublicStyleOverrides(v2ConfigForDraft());
      if (checked.errors.length) {
        setSaveError(`V2 branding was not saved: ${checked.errors.join("; ")}.`);
        return;
      }
      setSaving(true);
      let result: V2SaveResult;
      try {
        result = await saveV2Branding(checked.document, false);
        if (result.ok) applyConfirmedV2(result.confirmed);
      } catch (error) {
        result = { ok: false, message: error instanceof Error ? error.message : "Unexpected error; your draft is still open." };
      } finally {
        setSaving(false);
      }
      if (!result.ok) {
        setSaveError(`V2 branding could not be saved. ${result.message}`);
        return;
      }
      setSaveSuccess(result.confirmed.public_template_version === "v2"
        ? "Saved. This event already uses V2, so its live pages now show these changes."
        : "V2 draft saved. This event's live pages still use the existing template.");
      if (opts?.returnAfter) navigate({ to: "/admin/events/$eventId", params: { eventId } });
      return;
    }

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
      ["Event heading colour", form.hero_fg_color],
      ["Hero accent", form.hero_accent_color],
      ["Welcome copy colour", form.hero_body_color],
      ["Hero overlay colour", form.hero_overlay_color],
    ];
    for (const [label, v] of checks) {
      const err = hexCheck(label, trim(v));
      if (err) { setValidationError(err); return; }
    }

    const isCustomFamily = (v: string) =>
      customFonts.some((f) => f.family_name.toLowerCase() === v.toLowerCase());
    const fontOk = (v: string) => isSupportedEventFont(v) || isCustomFamily(v);

    const font_family = trim(form.font_family);
    if (font_family && !fontOk(font_family)) {
      setValidationError("Pick a body font from the list."); return;
    }
    const heading_font_family = trim(form.heading_font_family);
    if (heading_font_family && !fontOk(heading_font_family)) {
      setValidationError("Pick a heading font from the list."); return;
    }
    const default_emotive_font_family = trim(form.default_emotive_font_family);
    if (default_emotive_font_family && !fontOk(default_emotive_font_family)) {
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
      hero_body_color: orNull(form.hero_body_color),
      hero_overlay_color: orNull(form.hero_overlay_color),
      hero_overlay_opacity: hero_overlay_opacity_num,
      // Cover focal point (percentages 0–100). Blank → NULL (defaults to 50).
      cover_focal_x: form.cover_focal_x.trim() ? Math.max(0, Math.min(100, Math.round(Number(form.cover_focal_x)))) : null,
      cover_focal_y: form.cover_focal_y.trim() ? Math.max(0, Math.min(100, Math.round(Number(form.cover_focal_y)))) : null,
      // Event logo presentation. Blank → NULL → square + transparent.
      logo_shape: orNull(form.logo_shape),
      logo_backdrop: orNull(form.logo_backdrop),
      logo_backdrop_color:
        form.logo_backdrop === "color" ? orNull(form.logo_backdrop_color) : null,
      // Optional custom public menu item is owned by the event page's
      // Branding tab, so this editor never writes those columns.
      // Brand Kit metadata
      brand_kit_key: brandKitKey,
      brand_kit_version: brandKitKey && brandKitKey !== "custom" ? BRAND_KIT_VERSION : null,
      // The modern branding editor owns colours through explicit semantic
      // columns. Keep legacy palette overlays from replacing saved colours
      // on the public page, especially when the organiser selects Custom.
      palette_key: brandKitKey === "custom" ? "custom" : brandKitKey ? null : (branding?.palette_key ?? null),
      page_background_key: brandKitKey ? null : (branding?.page_background_key ?? null),
    };

    const { data: existing } = await supabase
      .from("event_branding")
      .select("event_id")
      .eq("event_id", bundle.event.id)
      .eq("agency_id", agencyId)
      .maybeSingle();

    type WriteError = {
      message: string;
      code?: string | null;
      details?: string | null;
      hint?: string | null;
    };

    // Columns this database is missing (migration not yet applied). They are
    // dropped from BOTH the write payload and the returning select, because a
    // 42703 can come from either half of the request.
    const missingCols = new Set<string>();

    function selectList(): string {
      return EVENT_BRANDING_SELECT_FALLBACK
        .split(", ")
        .filter((c) => !missingCols.has(c))
        .join(", ");
    }

    async function writeRow(payload: Record<string, unknown>): Promise<{
      row: Branding | null;
      error: WriteError | null;
    }> {
      if (!bundle) return { row: null, error: { message: "Internal error." } };
      if (existing) {
        const { data, error } = await supabase
          .from("event_branding")
          .update(payload)
          .eq("event_id", bundle.event.id)
          .eq("agency_id", agencyId!)
          .select(selectList())

          .maybeSingle();
        return { row: data as Branding | null, error };
      }
      const { data, error } = await supabase
        .from("event_branding")
        .insert({ agency_id: agencyId!, event_id: bundle.event.id, ...payload })
        .select(selectList())

        .maybeSingle();
      return { row: data as Branding | null, error };
    }

    // Extract the offending column name from Postgres ("column "x" of
    // relation", "column event_branding.x does not exist") or PostgREST
    // schema-cache (PGRST204: "Could not find the 'x' column of ...")
    // error messages.
    function unknownColumn(msg: string): string | null {
      const pg = msg.match(/column "([^"]+)" of relation/i);
      if (pg?.[1]) return pg[1];
      const missing = msg.match(/column (?:[\w.]*?\.)?"?([a-z0-9_]+)"? does not exist/i);
      if (missing?.[1]) return missing[1];
      const prst = msg.match(/could not find the '([^']+)' column/i);
      return prst?.[1] ?? null;
    }

    let payload: Record<string, unknown> = fullPayload;
    let { row: savedRow, error: writeErr } = await writeRow(payload);

    // Tolerant fallback: drop any keys the DB rejects as unknown columns
    // (migration not yet applied in some environments) and retry until
    // the write succeeds or the error is unrelated. Each retry must drop a
    // distinct column, so the same invalid request is never repeated.
    const dropped = new Set<string>();
    let guard = 0;
    while (writeErr && guard < 12) {
      const col = unknownColumn(writeErr.message ?? "");
      if (!col || dropped.has(col)) break;
      console.warn("[branding-save] dropping unknown column and retrying", { col });
      dropped.add(col);
      missingCols.add(col);
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
        details: writeErr.details ?? null,
        hint: writeErr.hint ?? null,
      });
      setSaving(false);
      const parts = [
        writeErr.message,
        writeErr.details ? `Details: ${writeErr.details}` : null,
        writeErr.hint ? `Hint: ${writeErr.hint}` : null,
        writeErr.code ? `Code: ${writeErr.code}` : null,
      ].filter(Boolean);
      setSaveError(`Branding could not be saved. ${parts.join(" · ")}`);
      return;
    }

    if (!savedRow) {
      setSaving(false);
      setSaveError("Branding could not be saved (no row affected). Please reload the page.");
      return;
    }

    setBundle((b) => (b ? { ...b, branding: savedRow!, hasBranding: true } : b));
    setV1Form(brandingToForm(savedRow));
    // Classic save never touches V2 storage; keep an in-progress V2 draft.
    if (!v2Dirty) setV2Form(brandingToV2Form({ ...savedRow, v2_style_config: bundle.branding?.v2_style_config ?? null, public_template_version: bundle.branding?.public_template_version ?? null } as Branding));
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
        {loadError && (
          <div className="mt-2 font-mono text-[12px] opacity-80">{loadError}</div>
        )}
      </div>
    );
  }

  const { event, branding, venues } = bundle;

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
    hero_body_color: form.hero_body_color || null,
  });

  /**
   * The embedded preview renders the REAL public landing component, so it
   * needs the same PublicEventData contract as the live route — saved event
   * content and venues, plus the UNSAVED branding form state.
   */
  const previewEvent = formToPreviewEvent(event, branding, form);

  const selectedKit = getBrandKit(form.brand_kit_key);
  const kitSubtitle = form.brand_kit_key === "custom"
    ? "Custom — edited"
    : selectedKit
      ? selectedKit.label
      : "No kit selected — using legacy palette";

  const confirmImmediateAssetAction = () => {
    if (!hasUnsavedChanges) return true;
    toast.warning("Save or discard your form changes before changing an image or uploaded font.", {
      duration: 9000,
      closeButton: true,
    });
    return false;
  };

  if (editorMode === "v2") {
    return (
      <VisualBrandingEditor
        event={event}
        eventId={eventId}
        primaryDomain={primaryDomain}
        previewEvent={previewEvent}
        venues={venues}
        form={form}
        setForm={setForm}
        editColour={editColour}
        theme={themeForPreview}
        selectedRole={selectedRole}
        setSelectedRole={setSelectedRole}
        previewWidth={previewWidth}
        setPreviewWidth={setPreviewWidth}
        recentColours={recentColours}
        setRecentColours={setRecentColours}
        canEdit={canEdit}
        saving={saving}
        saveError={validationError ?? saveError}
        saveSuccess={saveSuccess}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={() => onSave()}
        onSaveAndReturn={() => onSave({ returnAfter: true })}
        onBack={() => changeEditorMode("classic")}
        onExit={() => {
          if (!hasUnsavedChanges || window.confirm("Discard your unsaved branding changes and return to the event?")) {
            navigate({ to: "/admin/events/$eventId", params: { eventId } });
          }
        }}
        selectedKit={selectedKit}
        applyBrandKit={applyBrandKit}
        selectCustomBrandKit={selectCustomBrandKit}
        clearBrandKit={() => setForm({ ...EMPTY_FORM,
          font_family: form.font_family,
          heading_font_family: form.heading_font_family,
          welcome_copy: form.welcome_copy,
          terms_url: form.terms_url,
          venue_label_singular: form.venue_label_singular,
          venue_label_plural: form.venue_label_plural,
          hero_overlay_opacity: form.hero_overlay_opacity,
        })}
        customFonts={customFonts}
        branding={branding}
        agencyId={agencyId}
        confirmImmediateAssetAction={confirmImmediateAssetAction}
        onAssetUpload={async (kind, file) => {
          if (!confirmImmediateAssetAction()) return "Save or discard form changes first.";
          if (!agencyId) return "Select an organisation before uploading.";
          const res = await uploadEventAsset({ agencyId, eventId: event.id, kind, file });
          if (!res.ok) return res.error;
          return persistAssetPath(kind, res.path, kind === "logo" ? branding?.logo_path ?? null : branding?.cover_path ?? null);
        }}
        onAssetRemove={(kind) => {
          if (!confirmImmediateAssetAction()) return Promise.resolve("Save or discard form changes first.");
          return removeAsset(kind, kind === "logo" ? branding?.logo_path ?? null : branding?.cover_path ?? null);
        }}
        v2ConfigForDraft={v2ConfigForDraft}
        v1Form={v1Form}
        onV2Activated={applyConfirmedV2}
        saveV2Branding={saveV2Branding}
      />
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="sticky top-0 z-30 -mx-6 -mt-6 border-b border-[#E6ECF4] bg-white/95 px-6 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] backdrop-blur">
        <Header
          event={event}
          primaryDomain={primaryDomain}
          canEdit={canEdit}
          saving={saving}
          onSave={() => onSave()}
          onSaveAndReturn={() => onSave({ returnAfter: true })}
          onCancel={() => navigate({ to: "/admin/events/$eventId", params: { eventId } })}
          eventId={eventId}
          hasUnsavedChanges={hasUnsavedChanges}

        />
      </div>


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

          {/* Logo + cover uploads — minimised by default so colour editing stays close to the preview. */}
          <CollapsibleSection
            id="logo"
            title="Event logo"
            subtitle={branding?.logo_path ? "Logo uploaded" : "No logo uploaded"}
            expanded={expanded.logo}
            onToggle={() => toggle("logo")}
          >
            <AssetUploader
              kind="logo"
              currentPath={branding?.logo_path ?? null}
              canEdit={canEdit}
              embedded
              onUpload={async (file) => {
                if (!agencyId) return "Select an organisation before uploading.";
                const res = await uploadEventAsset({ agencyId, eventId: event.id, kind: "logo", file });
                if (!res.ok) return res.error;
                return persistAssetPath("logo", res.path, branding?.logo_path ?? null);
              }}
              onRemove={() => removeAsset("logo", branding?.logo_path ?? null)}
            />

            {/* The logo now sits centred over the hero cover image and at 200%
                size on the posters, so it needs shape + backdrop controls to
                stay legible against busy photography. */}
            <div className="mt-4 space-y-3 border-t border-[#E2E8F0] pt-4">
              <div>
                <span className="block text-[13px] font-semibold text-[#0F172A]">Logo shape</span>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  How the logo is framed over the cover image and on posters.
                </p>
                <div className="mt-2 flex gap-2">
                  {[
                    { value: "square", label: "Square" },
                    { value: "circle", label: "Circle" },
                  ].map((opt) => {
                    const active = (form.logo_shape || "square") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={!canEdit || saving}
                        onClick={() => setForm({ ...form, logo_shape: opt.value })}
                        className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition ${
                          active
                            ? "border-[#0F172A] bg-[#0F172A] text-white"
                            : "border-[#CBD5E1] bg-white text-[#334155] hover:border-[#94A3B8]"
                        } disabled:opacity-50`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-[13px] font-semibold text-[#0F172A]">Logo backdrop</span>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  A solid colour behind the logo helps it stand out on a busy hero photo.
                </p>
                <div className="mt-2 flex gap-2">
                  {[
                    { value: "transparent", label: "Transparent" },
                    { value: "color", label: "Colour" },
                  ].map((opt) => {
                    const active = (form.logo_backdrop || "transparent") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={!canEdit || saving}
                        onClick={() =>
                          setForm({
                            ...form,
                            logo_backdrop: opt.value,
                            // Give the colour picker a usable starting value.
                            logo_backdrop_color:
                              opt.value === "color" && !form.logo_backdrop_color.trim()
                                ? "#ffffff"
                                : form.logo_backdrop_color,
                          })
                        }
                        className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition ${
                          active
                            ? "border-[#0F172A] bg-[#0F172A] text-white"
                            : "border-[#CBD5E1] bg-white text-[#334155] hover:border-[#94A3B8]"
                        } disabled:opacity-50`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {form.logo_backdrop === "color" && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Logo backdrop colour"
                      value={/^#[0-9a-fA-F]{6}$/.test(form.logo_backdrop_color) ? form.logo_backdrop_color : "#ffffff"}
                      disabled={!canEdit || saving}
                      onChange={(e) => setForm({ ...form, logo_backdrop_color: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded-[8px] border border-[#CBD5E1] bg-white p-1"
                    />
                    <input
                      type="text"
                      aria-label="Logo backdrop colour hex"
                      value={form.logo_backdrop_color}
                      placeholder="#ffffff"
                      disabled={!canEdit || saving}
                      onChange={(e) => setForm({ ...form, logo_backdrop_color: e.target.value })}
                      className="w-28 rounded-[8px] border border-[#CBD5E1] px-2 py-1.5 font-mono text-[13px]"
                    />
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            id="cover"
            title="Cover image"
            subtitle={branding?.cover_path ? "Cover image uploaded" : "No cover image uploaded"}
            expanded={expanded.cover}
            onToggle={() => toggle("cover")}
          >
            <AssetUploader
              kind="cover"
              currentPath={branding?.cover_path ?? null}
              canEdit={canEdit}
              embedded
              onUpload={async (file) => {
                if (!agencyId) return "Select an organisation before uploading.";
                const res = await uploadEventAsset({ agencyId, eventId: event.id, kind: "cover", file });
                if (!res.ok) return res.error;
                return persistAssetPath("cover", res.path, branding?.cover_path ?? null);
              }}
              onRemove={() => removeAsset("cover", branding?.cover_path ?? null)}
            />
            {branding?.cover_path ? (
              <div className="mt-4">
                <CoverPositioner
                  imageUrl={getEventAssetPublicUrl(branding.cover_path)}
                  focalX={form.cover_focal_x.trim() ? Number(form.cover_focal_x) : 50}
                  focalY={form.cover_focal_y.trim() ? Number(form.cover_focal_y) : 50}
                  disabled={!canEdit}
                  onChange={(x, y) =>
                    setForm({
                      ...form,
                      cover_focal_x: String(x),
                      cover_focal_y: String(y),
                    })
                  }
                />
              </div>
            ) : null}
          </CollapsibleSection>



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
              onSelectCustom={selectCustomBrandKit}
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
              <ColorRoleRow label="Primary colour" fieldName="primary_color" helper="Brand colour used across CTAs, highlights, and bottom-nav default."
                resolved={themeForPreview.primary} value={form.primary_color}
                onChange={(v) => editColour("primary_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Accent colour" fieldName="accent_color" helper="Highlight colour used for active states, badges and accents."
                resolved={themeForPreview.accent} value={form.accent_color}
                onChange={(v) => editColour("accent_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Link colour" fieldName="link_color" helper="Inline links on the public pages."
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
              <ColorRoleRow label="Page background" fieldName="page_background_color" helper="Painted behind everything on the public passport pages."
                resolved={themeForPreview.pageBg} value={form.page_background_color}
                onChange={(v) => editColour("page_background_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Page heading colour" fieldName="page_heading_color" helper="Section headings and headlines on the page background."
                resolved={themeForPreview.pageText} value={form.page_heading_color}
                onChange={(v) => editColour("page_heading_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.pageText, themeForPreview.pageBg, "page background")} />
              <ColorRoleRow label="Page body text colour" fieldName="page_body_color" helper="Body copy on the page background. Falls back to the heading colour when blank."
                resolved={themeForPreview.pageText} value={form.page_body_color}
                onChange={(v) => editColour("page_body_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Page muted text colour" fieldName="page_muted_color" helper="Helper / metadata text on the page background."
                resolved={themeForPreview.pageMuted} value={form.page_muted_color}
                onChange={(v) => editColour("page_muted_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.pageMuted, themeForPreview.pageBg, "page background", 3)} />
              <ColorRoleRow label="Page border colour" fieldName="border_color" helper="Dividers and outlines on the page surface."
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
              <ColorRoleRow label="Card background" fieldName="card_background_color" helper="Background colour for venue cards, awards cards, etc."
                resolved={themeForPreview.cardBg} value={form.card_background_color}
                onChange={(v) => editColour("card_background_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Card heading colour" fieldName="card_heading_color" helper="Headings inside cards (venue name, award title)."
                resolved={themeForPreview.cardText} value={form.card_heading_color}
                onChange={(v) => editColour("card_heading_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.cardText, themeForPreview.cardBg, "card background")} />
              <ColorRoleRow label="Card body text colour" fieldName="card_body_color" helper="Used for standard text inside cards. Falls back to the card heading colour. Welcome copy now sits over the cover image and uses its own hero colour."
                resolved={themeForPreview.cardText} value={form.card_body_color}
                onChange={(v) => editColour("card_body_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Card muted text colour" fieldName="card_muted_color" helper="Addresses, descriptions, metadata inside cards."
                resolved={themeForPreview.cardMuted} value={form.card_muted_color}
                onChange={(v) => editColour("card_muted_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.cardMuted, themeForPreview.cardBg, "card background", 3)} />
              <ColorRoleRow label="Card border colour" fieldName="card_border_color" helper="Borders / dividers on cards. Falls back to the page border."
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
              <ColorRoleRow label="Primary button background" fieldName="button_primary_bg" helper="Background colour for the primary CTA buttons."
                resolved={themeForPreview.buttonPrimaryBg} value={form.button_primary_bg}
                onChange={(v) => editColour("button_primary_bg", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Primary button text" fieldName="button_primary_fg" helper="Text / icons drawn on the primary button."
                resolved={themeForPreview.buttonPrimaryFg} value={form.button_primary_fg}
                onChange={(v) => editColour("button_primary_fg", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.buttonPrimaryFg, themeForPreview.buttonPrimaryBg, "primary button")} />
              <ColorRoleRow label="Secondary button background" fieldName="button_secondary_bg" helper="Background colour for secondary CTAs."
                resolved={themeForPreview.buttonSecondaryBg} value={form.button_secondary_bg}
                onChange={(v) => editColour("button_secondary_bg", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Secondary button text" fieldName="button_secondary_fg" helper="Text / icons on the secondary button."
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
              <ColorRoleRow label="Navigation background" fieldName="nav_background_color" helper="Sticky header, mobile bottom-nav and side drawer."
                resolved={themeForPreview.navBg} value={form.nav_background_color}
                onChange={(v) => editColour("nav_background_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Navigation inactive text / icon" fieldName="nav_fg_color" helper="Default nav-item colour."
                resolved={themeForPreview.navText} value={form.nav_fg_color}
                onChange={(v) => editColour("nav_fg_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.navText, themeForPreview.navBg, "nav background")} />
              <ColorRoleRow label="Navigation muted text / icon" fieldName="nav_muted_color" helper="Subtle nav labels (e.g. badge counts)."
                resolved={themeForPreview.navMuted} value={form.nav_muted_color}
                onChange={(v) => editColour("nav_muted_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Navigation active text / icon" fieldName="nav_active_fg_color" helper="Colour for the currently selected nav item."
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
              <ColorRoleRow label="Hero background / overlay" fieldName="hero_bg_color" helper="Background tint behind the event title when there is no cover image."
                resolved={themeForPreview.heroBg} value={form.hero_bg_color}
                onChange={(v) => editColour("hero_bg_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Event heading colour" fieldName="hero_fg_color" helper="Colour of the event title displayed over the cover image. Does not affect welcome copy, which has its own colour below."
                resolved={themeForPreview.heroFg} value={form.hero_fg_color}
                onChange={(v) => editColour("hero_fg_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.heroFg, themeForPreview.heroBg, "hero background")} />
              <ColorRoleRow label={`Cover eyebrow label colour ("Digital Passport")`} fieldName="hero_accent_color" helper={`Colour of the small uppercase label above the event title on the cover (e.g. "Digital Passport"), plus other hero accent flourishes.`}
                resolved={themeForPreview.heroAccent} value={form.hero_accent_color}
                onChange={(v) => editColour("hero_accent_color", v)} disabled={!canEdit || saving} />
              <ColorRoleRow label="Welcome copy colour (over cover image)" fieldName="hero_body_color" helper="Colour of the welcome copy shown over the cover image, directly under the event title. Independent of the event heading colour."
                resolved={themeForPreview.heroBody} value={form.hero_body_color}
                onChange={(v) => editColour("hero_body_color", v)} disabled={!canEdit || saving}
                warnings={warn(themeForPreview.heroBody, themeForPreview.heroBg, "hero background")} />
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
              customFonts={customFonts}
              canUpload={canEdit && !!agencyId}
              onUpload={async (file, familyName) => {
                if (!agencyId) return { ok: false as const, error: "No agency selected." };
                const res = await uploadEventCustomFont({
                  agencyId,
                  eventId: event.id,
                  familyName,
                  file,
                });
                if (res.ok) {
                  setCustomFonts((prev) =>
                    [...prev, res.font].sort((a, b) => a.family_name.localeCompare(b.family_name)),
                  );
                  toast.success(`“${res.font.family_name}” uploaded. Pick it above, then Save.`);
                }
                return res;
              }}
              onDelete={async (font) => {
                const res = await deleteEventCustomFont(font);
                if (!res.ok) {
                  toast.error(res.error, { duration: 10000, closeButton: true });
                  return;
                }
                setCustomFonts((prev) => prev.filter((f) => f.id !== font.id));
                setForm((prev) => ({
                  ...prev,
                  font_family: prev.font_family === font.family_name ? "" : prev.font_family,
                  heading_font_family:
                    prev.heading_font_family === font.family_name ? "" : prev.heading_font_family,
                  default_emotive_font_family:
                    prev.default_emotive_font_family === font.family_name
                      ? ""
                      : prev.default_emotive_font_family,
                }));
                toast.success(`“${font.family_name}” removed. Save to apply.`);
              }}
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
          className="order-1 space-y-5 scroll-mt-4 md:order-2 md:w-[440px] md:shrink-0 md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:pr-1 lg:w-[620px] xl:w-[760px]"
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
            <BrandHoverProbe>
              <div className="rounded-[16px] border border-[#E6ECF4] bg-[#F8FAFC] p-4">
                <div
                  className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]"
                >
                  <span>Customer landing — live preview</span>
                  <span>Mobile · unsaved changes shown</span>
                </div>
                {/* The real public landing renderer, at mobile width, with
                    navigation inert (mode="preview", no subdomain) and the
                    unsaved branding form state injected. Never rebuild the
                    landing page here — edit EventPublicLanding instead. */}
                <div
                  className="mx-auto w-[390px] max-w-full overflow-hidden rounded-[20px] border border-[#D9E2EF] bg-white shadow-inner"
                  aria-label="Customer landing page preview"
                >
                  <div className="max-h-[70vh] overflow-y-auto">
                    <PublicEventTemplate
                      key={previewEvent.event_id}
                      subdomain={null}
                      event={previewEvent}
                      venues={venues}
                      mode="preview"
                      forceTemplate="v1"
                    />
                  </div>
                </div>
                <details className="mt-4 rounded-[12px] border border-[#E6ECF4] bg-white p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
                    Semantic tokens (developer aid)
                  </summary>
                  <div className="mt-3">
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
                      heroBodyColor={form.hero_body_color}
                      pageHeadingColor={form.page_heading_color}
                      pageBodyColor={form.page_body_color}
                      pageMutedColor={form.page_muted_color}
                      cardHeadingColor={form.card_heading_color}
                      cardBodyColor={form.card_body_color}
                      cardMutedColor={form.card_muted_color}
                      applyBackground={false}
                    >
                      <SemanticPreview venueLabelPlural={venueLabels.plural} />
                    </EventPaletteScope>
                  </div>
                </details>
              </div>
            </BrandHoverProbe>
          </div>

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

function VisualBrandingEditor({
  event, eventId, primaryDomain, previewEvent, venues, form, setForm, editColour, theme,
  selectedRole, setSelectedRole, previewWidth, setPreviewWidth, recentColours, setRecentColours,
  canEdit, saving, saveError, saveSuccess, hasUnsavedChanges, onSave, onSaveAndReturn,
  onBack, onExit, selectedKit, applyBrandKit, selectCustomBrandKit, clearBrandKit,
  customFonts, branding, agencyId, confirmImmediateAssetAction, onAssetUpload, onAssetRemove, v2ConfigForDraft,
  v1Form, onV2Activated, saveV2Branding,
}: {
  event: EventRow; eventId: string; primaryDomain: Domain | null; previewEvent: PublicEventData;
  venues: PublicVenueData[]; form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>;
  editColour: <K extends keyof Form>(key: K, value: Form[K]) => void;
  theme: ReturnType<typeof resolveEventTheme>; selectedRole: EditorSelection | null;
  setSelectedRole: (role: EditorSelection | null) => void; previewWidth: "mobile" | "desktop";
  setPreviewWidth: (width: "mobile" | "desktop") => void; recentColours: string[];
  setRecentColours: React.Dispatch<React.SetStateAction<string[]>>; canEdit: boolean; saving: boolean;
  saveError: string | null; saveSuccess: string | null; hasUnsavedChanges: boolean;
  onSave: () => void; onSaveAndReturn: () => void; onBack: () => void; onExit: () => void;
  selectedKit: BrandKit | null; applyBrandKit: (kit: BrandKit) => void; selectCustomBrandKit: () => void;
  clearBrandKit: () => void; customFonts: EventCustomFont[]; branding: Branding | null; agencyId: string | null;
  confirmImmediateAssetAction: () => boolean;
  onAssetUpload: (kind: EventAssetKind, file: File) => Promise<string | null>;
  onAssetRemove: (kind: EventAssetKind) => Promise<string | null>;
  v2ConfigForDraft: () => PublicStyleOverrideDocument;
  v1Form: Form;
  onV2Activated: (confirmed: { public_template_version: string; v2_style_config: PublicStyleOverrideDocument }) => void;
  saveV2Branding: (config: PublicStyleOverrideDocument, activate: boolean) => Promise<
    | { ok: true; confirmed: { public_template_version: string; v2_style_config: PublicStyleOverrideDocument } }
    | { ok: false; message: string }
  >;
}) {
  const [hoveredInstance, setHoveredInstance] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const [recordScope, setRecordScope] = useState<"record" | "type">("record");
  const [styleState, setStyleState] = useState<PublicStyleState>("normal");
  const [stylePast, setStylePast] = useState<PublicStyleOverrideDocument[]>([]);
  const [styleFuture, setStyleFuture] = useState<PublicStyleOverrideDocument[]>([]);
  const [activating, setActivating] = useState(false);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  // Navigator lists what the real preview DOM actually renders right now.
  const [renderedIds, setRenderedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const body = frameDoc?.body;
    if (!body) return;
    let raf = 0;
    const scan = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = new Set(Array.from(body.querySelectorAll<HTMLElement>("[data-event-style]")).map((el) => el.dataset.eventStyle ?? ""));
        setRenderedIds((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
      });
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, [frameDoc]);
  const [previewPage, setPreviewPage] = useState<"home" | "join" | "passport" | "venues" | "venue" | "offers" | "prizes" | "map" | "leaderboard" | "faq" | "terms" | "privacy" | "legal" | "bookmarks" | ResultPreviewPage>("home");
  const [previewSource, setPreviewSource] = useState<"draft" | "saved" | "live">("draft");
  const [previewInteraction, setPreviewInteraction] = useState<"select" | "navigate">("select");
  const [inherited, setInherited] = useState<Partial<Record<PublicStyleProperty, string>>>({});
  // Real, read-only public content for this event; person-specific states use labelled samples.
  const [publicContent, setPublicContent] = useState<V2PreviewContent | null>(null);
  const [venueExtras, setVenueExtras] = useState<V2PreviewVenueExtras | null>(null);
  const [sampleState, setSampleState] = useState<"populated" | "empty">("populated");
  // Page-specific safe sample states (preview fixtures only; never submitted or stored).
  const [pageStateChoice, setPageStateChoice] = useState<Record<string, string>>({});
  const previewSubdomain = primaryDomain?.public_subdomain ?? null;
  useEffect(() => {
    let cancelled = false;
    void loadV2PreviewContent(previewSubdomain, event.id).then((content) => { if (!cancelled) setPublicContent(content); });
    return () => { cancelled = true; };
  }, [previewSubdomain, event.id]);
  const busy = saving || activating;
  const sharedRole = selectedRole && selectedRole in VISUAL_ROLE_META ? selectedRole as VisualBrandRole : null;
  const itemMeta: PublicStyleElementDefinition | null = selectedRole ? PUBLIC_STYLE_ELEMENTS.find((item) => item.id === selectedRole) ?? null : null;
  const panelRole = sharedRole ?? (itemMeta ? ITEM_SHARED_ROLE[itemMeta.id] ?? null : null);
  const roleMeta = panelRole ? VISUAL_ROLE_META[panelRole] : null;
  const recordTarget = itemMeta?.repeat && selectedRecord && recordScope === "record" ? selectedRecord : null;
  const selectedInstance = itemMeta ? (selectedRecord ? `${itemMeta.id}@${selectedRecord}` : itemMeta.id) : selectedRole;
  void primaryDomain; void eventId; void selectedKit; void agencyId; void confirmImmediateAssetAction;

  const selectFromEvent = (target: EventTarget | null) => {
    const node = target as Element | null;
    const element = node && typeof node.closest === "function" ? node.closest<HTMLElement>("[data-brand-role]") : null;
    const role = element?.dataset.brandRole;
    if (!role || !(role in VISUAL_ROLE_META || PUBLIC_STYLE_ELEMENTS.some((item) => item.id === role))) return;
    const instance = element?.dataset.brandInstance ?? role;
    const at = instance.indexOf("@");
    setSelectedRecord(at > 0 ? instance.slice(at + 1) : null);
    setRecordScope("record");
    setStyleState("normal");
    setSelectedRole(role as EditorSelection);
  };

  const selectFromNavigator = (role: EditorSelection) => { setSelectedRecord(null); setStyleState("normal"); setSelectedRole(role); };

  const updateStyleDocument = (recipe: (draft: PublicStyleOverrideDocument) => PublicStyleOverrideDocument) => {
    if (!canEdit || busy) return;
    const before = parsePublicStyleOverrides(form.style_overrides);
    const next = parsePublicStyleOverrides(recipe(structuredClone(before)));
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    setStylePast((history) => [...history.slice(-49), before]);
    setStyleFuture([]);
    setForm((current) => ({ ...current, style_overrides: next }));
  };

  const undoStyle = () => {
    const previous = stylePast.at(-1);
    if (!previous) return;
    setStyleFuture((future) => [form.style_overrides, ...future].slice(0, 50));
    setStylePast((history) => history.slice(0, -1));
    setForm((current) => ({ ...current, style_overrides: previous }));
  };

  const redoStyle = () => {
    const next = styleFuture[0];
    if (!next) return;
    setStylePast((history) => [...history.slice(-49), form.style_overrides]);
    setStyleFuture((future) => future.slice(1));
    setForm((current) => ({ ...current, style_overrides: next }));
  };

  const currentOverride = (document: PublicStyleOverrideDocument) => itemMeta
    ? (recordTarget ? document.records?.[itemMeta.id]?.[recordTarget] : document.items[itemMeta.id])
    : undefined;

  const setItemProperty = (property: PublicStyleProperty, value: string | number | null) => {
    if (!itemMeta) return;
    updateStyleDocument((next) => {
      const item = { ...(currentOverride(next) ?? {}) };
      if (styleState === "normal") {
        const normal = { ...(item.normal ?? {}) };
        if (value === null || value === "") delete normal[property]; else normal[property] = value;
        item.normal = Object.keys(normal).length ? normal : undefined;
      } else {
        const states = { ...(item.states ?? {}) };
        const stateValues = { ...(states[styleState] ?? {}) };
        if (value === null || value === "") delete stateValues[property]; else stateValues[property] = value;
        if (Object.keys(stateValues).length) states[styleState] = stateValues; else delete states[styleState];
        item.states = Object.keys(states).length ? states : undefined;
      }
      const empty = !item.normal && !item.states;
      if (recordTarget) {
        const records = { ...(next.records ?? {}) };
        const forItem = { ...(records[itemMeta.id] ?? {}) };
        if (empty) delete forItem[recordTarget]; else forItem[recordTarget] = item;
        if (Object.keys(forItem).length) records[itemMeta.id] = forItem; else delete records[itemMeta.id];
        next.records = records;
      } else if (empty) delete next.items[itemMeta.id];
      else next.items[itemMeta.id] = item;
      return next;
    });
  };

  const resetItem = () => {
    if (!itemMeta) return;
    updateStyleDocument((next) => {
      if (recordTarget) {
        const forItem = { ...(next.records?.[itemMeta.id] ?? {}) };
        delete forItem[recordTarget];
        next.records = { ...(next.records ?? {}), [itemMeta.id]: forItem };
      } else delete next.items[itemMeta.id];
      return next;
    });
  };

  const navItems = form.style_overrides.navigation?.items ?? DEFAULT_PUBLIC_NAVIGATION.items;
  const updateNavigation = (items: typeof navItems) => updateStyleDocument((next) => ({ ...next, navigation: { items: [...items] } }));
  const updateNavigationItem = (id: string, patch: { label?: string; icon?: PublicNavIconId }) =>
    updateNavigation(navItems.map((item) => item.id === id ? { ...item, ...patch } : item));
  const moveNavigationItem = (id: string, direction: -1 | 1) => {
    const index = navItems.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= navItems.length) return;
    const next = [...navItems];
    [next[index], next[target]] = [next[target], next[index]];
    updateNavigation(next);
  };

  // Keyboard: Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo, Escape clears selection.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "Escape") { setSelectedRole(null); return; }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undoStyle(); }
      else if ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y") { event.preventDefault(); redoStyle(); }
    };
    window.addEventListener("keydown", onKey);
    frameDoc?.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); frameDoc?.removeEventListener("keydown", onKey); };
  });

  const previewConfig = v2ConfigForDraft();
  const previewKey = JSON.stringify(previewConfig);

  // Force the chosen appearance on the selected instance and read the
  // effective (inherited or overridden) rendered colours back for the inspector.
  useEffect(() => {
    if (!frameDoc) return;
    frameDoc.querySelectorAll("[data-preview-state]").forEach((node) => node.removeAttribute("data-preview-state"));
    if (!itemMeta || !selectedInstance) { setInherited({}); return; }
    const element = frameDoc.querySelector<HTMLElement>(`[data-brand-instance="${CSS.escape(selectedInstance)}"]`)
      ?? frameDoc.querySelector<HTMLElement>(`[data-event-style="${CSS.escape(itemMeta.id)}"]`);
    if (!element) { setInherited({}); return; }
    if (styleState !== "normal") element.setAttribute("data-preview-state", styleState);
    const view = frameDoc.defaultView;
    if (!view) return;
    const css = view.getComputedStyle(element);
    const icon = element.querySelector("svg");
    const iconCss = icon ? view.getComputedStyle(icon) : null;
    const varValue = (name: string) => css.getPropertyValue(name).trim();
    setInherited({
      color: cssColourToHex(css.color),
      backgroundColor: cssColourToHex(css.backgroundColor),
      borderColor: cssColourToHex(css.borderTopColor),
      iconColor: iconCss ? cssColourToHex(iconCss.color) : cssColourToHex(css.color),
      iconBackgroundColor: cssColourToHex(varValue("--item-icon-bg") || css.backgroundColor),
      progressTrackColor: cssColourToHex(varValue("--item-progress-track")) || theme.border,
      progressFillColor: cssColourToHex(varValue("--item-progress-fill")) || theme.accent,
      fontFamily: css.fontFamily.split(",")[0]?.replace(/["']/g, "").trim(),
      fontSize: String(Math.round(parseFloat(css.fontSize))),
      fontWeight: css.fontWeight,
      lineHeight: css.lineHeight === "normal" ? "" : String(Math.round((parseFloat(css.lineHeight) / parseFloat(css.fontSize)) * 100) / 100),
      textAlign: css.textAlign,
      opacity: String(Math.round(parseFloat(css.opacity) * 100)),
    });
  }, [frameDoc, itemMeta?.id, selectedInstance, styleState, previewKey, previewWidth, theme]);

  const activateV2 = async () => {
    if (!canEdit || busy || !agencyId) return;
    const checked = validatePublicStyleOverrides(v2ConfigForDraft());
    if (checked.errors.length) { toast.error(`V2 was not activated: ${checked.errors.join("; ")}.`); return; }
    if (!window.confirm("Use the V2 public template for this event? This activates only this event and saves this V2 configuration atomically.")) return;
    setActivating(true);
    try {
      const result = await saveV2Branding(checked.document, true);
      if (!result.ok || result.confirmed.public_template_version !== "v2") {
        toast.error(`V2 was not activated. ${result.ok ? "No confirmed response was returned." : result.message}`);
        return;
      }
      onV2Activated(result.confirmed);
      toast.success("V2 is now live for this event only.");
    } catch (error) {
      toast.error(`V2 was not activated. ${error instanceof Error ? error.message : "Unexpected error."}`);
    } finally {
      setActivating(false);
    }
  };

  // Labelled quick choices from THIS event's current draft theme + Brand Kit + session colours.
  const quickColours: QuickColour[] = dedupeQuick([
    { colour: theme.primary, label: "Primary" }, { colour: theme.accent, label: "Accent" },
    { colour: theme.pageBg, label: "Page background" }, { colour: theme.cardBg, label: "Card background" },
    { colour: theme.pageText, label: "Page text" }, { colour: theme.cardText, label: "Card text" },
    { colour: theme.buttonPrimaryBg, label: "Primary button" }, { colour: theme.buttonPrimaryFg, label: "Primary button text" },
    { colour: theme.border, label: "Border" }, { colour: theme.heroBg, label: "Hero background" },
    ...(selectedKit ? Object.entries(selectedKit.colors).map(([name, colour]) => ({ colour: String(colour), label: `Brand Kit: ${name}` })) : []),
    ...recentColours.map((colour) => ({ colour, label: "Recent" })),
  ]);
  const rememberColour = (value: string) => {
    if (HEX_RE.test(value)) setRecentColours((current) => [value.toUpperCase(), ...current.filter((item) => item !== value.toUpperCase())].slice(0, 6));
  };

  const resolvedFor = (field: ColourField) => ({
    primary_color: theme.primary, accent_color: theme.accent, link_color: theme.link,
    page_background_color: theme.pageBg, page_heading_color: theme.pageHeading, page_body_color: theme.pageText,
    page_muted_color: theme.pageMuted, border_color: theme.border, card_background_color: theme.cardBg,
    card_heading_color: theme.cardHeading, card_body_color: theme.cardText, card_muted_color: theme.cardMuted,
    card_border_color: theme.cardBorder, button_primary_bg: theme.buttonPrimaryBg,
    button_primary_fg: theme.buttonPrimaryFg, button_secondary_bg: theme.buttonSecondaryBg,
    button_secondary_fg: theme.buttonSecondaryFg, nav_background_color: theme.navBg,
    nav_fg_color: theme.navText, nav_muted_color: theme.navMuted, nav_active_fg_color: theme.navActiveText,
    hero_bg_color: theme.heroBg, hero_fg_color: theme.heroFg, hero_accent_color: theme.heroAccent,
    hero_body_color: theme.heroBody, hero_overlay_color: form.hero_overlay_color || theme.heroBg,
    logo_backdrop_color: form.logo_backdrop_color || "#FFFFFF",
  })[field];

  const fieldWarnings = (field: ColourField) => {
    if (field === "page_heading_color" || field === "page_body_color") return warn(resolvedFor(field), theme.pageBg, "page background");
    if (field === "page_muted_color") return warn(resolvedFor(field), theme.pageBg, "page background", 3);
    if (field === "card_heading_color" || field === "card_body_color") return warn(resolvedFor(field), theme.cardBg, "card background");
    if (field === "card_muted_color") return warn(resolvedFor(field), theme.cardBg, "card background", 3);
    if (field === "button_primary_fg") return warn(theme.buttonPrimaryFg, theme.buttonPrimaryBg, "primary button");
    if (field === "button_secondary_fg") return warn(theme.buttonSecondaryFg, theme.buttonSecondaryBg, "secondary button");
    if (field === "nav_fg_color" || field === "nav_active_fg_color") return warn(resolvedFor(field), theme.navBg, "navigation");
    return undefined;
  };

  // Welcome copy: show the EFFECTIVE text and where it comes from, without writing anything on open.
  const welcomeOverride = form.welcome_copy !== brandingToForm(branding).welcome_copy;
  const effectiveWelcome = resolvePublicLandingCopy({ welcomeCopy: form.welcome_copy, description: previewEvent.description ?? null }) ?? "";
  const welcomeSource = form.welcome_copy.trim()
    ? (welcomeOverride ? "V2 welcome message for this event" : "Existing welcome message (inherited)")
    : (previewEvent.description?.trim() ? "Event description (inherited)" : "No welcome message");

  const override = itemMeta ? currentOverride(parsePublicStyleOverrides(form.style_overrides)) : undefined;
  const savedConfig = parsePublicStyleOverrides(branding?.v2_style_config);
  // Saved view: immutable saved event + saved branding row through the same complete mapping.
  const savedBaselineEvent = formToPreviewEvent(event, branding, brandingToV2Form(branding), publicContent?.event ?? null);
  // Live template: the event's actual public row and saved template version, never forced to V2.
  const liveIsV2 = branding?.public_template_version === "v2";
  const liveEvent = {
    ...(publicContent?.event ?? formToPreviewEvent(event, branding, brandingToForm(branding), null)),
    event_id: event.id,
    name: event.name,
    public_template_version: branding?.public_template_version ?? null,
    v2_style_config: liveIsV2 ? savedConfig : null,
  } as PublicBrandingEvent;

  const draftEvent = (previewSource === "live" ? liveEvent : { ...(previewSource === "draft" ? formToPreviewEvent(event, branding, form, publicContent?.event ?? null) : savedBaselineEvent), public_template_version: "v2", v2_style_config: previewSource === "draft" ? previewConfig : savedConfig }) as PublicBrandingEvent;
  const fixtureBranding = resolveEventBrandingKeys(draftEvent as never, { public_template_version: resolvePublicTemplateVersion(draftEvent.public_template_version), v2_style_config: draftEvent.v2_style_config ?? null });
  const comparisonReadOnly = previewSource !== "draft";
  const listVenues: ListVenueRow[] = venues.map((venue) => ({
    venue_id: venue.venue_id, name: venue.name, description: venue.description ?? null,
    address: venue.address ?? null, website_url: venue.website_url ?? null, phone: venue.phone ?? null, logo_path: venue.logo_path ?? null,
    cover_path: venue.cover_path ?? null, lat: venue.lat ?? null, lng: venue.lng ?? null, offer_summary: venue.offer_summary ?? null,
    offer_display_icon: venue.offer_display_icon ?? null, offer_display_colour: venue.offer_display_colour ?? null, offer_display_foreground_colour: venue.offer_display_foreground_colour ?? null,
    points_value: venue.points_value ?? null, order_index: venue.order_index ?? null, event_found: true,
  }));
  const selectedVenue = listVenues.find((venue) => venue.venue_id === selectedRecord) ?? listVenues[0] ?? null;
  const selectedVenueId = selectedVenue?.venue_id ?? null;
  useEffect(() => {
    let cancelled = false;
    setVenueExtras(null);
    if (selectedVenueId) void loadV2PreviewVenueExtras(previewSubdomain, selectedVenueId).then((row) => { if (!cancelled) setVenueExtras(row); });
    return () => { cancelled = true; };
  }, [previewSubdomain, selectedVenueId]);
  const previewLabels = resolveVenueLabels(draftEvent);
  const populated = sampleState === "populated";
  const PAGE_STATES: Record<string, Array<[string, string]>> = {
    join: [["new", "New visitor"], ["returning", "Returning visitor"], ["error", "Form errors"], ["success", "Registered (success)"]],
    passport: [["partial", "Some stamps"], ["empty", "No stamps yet"], ["complete", "All stamps"]],
    prizes: [["unlocked", "Has passport"], ["locked", "No passport yet"]],
    ...RESULT_PAGE_STATES,
  };
  const pageStates = PAGE_STATES[previewPage] ?? [];
  const pageState = pageStates.find(([key]) => key === pageStateChoice[previewPage])?.[0] ?? pageStates[0]?.[0] ?? "";
  const realFaq = publicContent?.faq ?? [];
  const realAwards = publicContent?.awards ?? [];
  const faqEntries = !populated ? [] : realFaq.length ? realFaq : [{ question: "Sample question (no FAQ published yet)", answer: "Sample answer shown only in the editor.", order_index: 0 }];
  const awardEntries = !populated ? [] : realAwards;
  const previewFeatures = {
    hasFaq: realFaq.length > 0,
    hasMap: previewHasMap(listVenues, publicContent?.eventMapPath ?? null),
    hasAwards: realAwards.length > 0,
    venueLabels: previewLabels,
  };
  const navigatePreview = (to: string, params?: Record<string, string | undefined>) => {
    if (to === "/") setPreviewPage("home");
    else if (to === "/venues/$venueId" || /^\/venues\/[^/]+$/.test(to)) {
      const record = params?.venueId ?? to.split("/").at(-1);
      if (record) setSelectedRecord(record);
      setPreviewPage("venue");
    } else if (to === "/venues") setPreviewPage("venues");
    else if (to === "/offers") setPreviewPage("offers");
    else if (to === "/join") setPreviewPage("join");
    else if (to === "/passport") setPreviewPage("passport");
    else if (to === "/prizes") setPreviewPage("prizes");
    else if (to === "/map") setPreviewPage("map");
    else if (to === "/leaderboard") setPreviewPage("leaderboard");
    else if (to === "/faq") setPreviewPage("faq");
    else if (to === "/bookmarks") setPreviewPage("bookmarks");
    else if (to === "/terms") setPreviewPage("terms");
    else if (to === "/privacy") setPreviewPage("privacy");
    else if (to === "/terms-privacy" || to === "/legal") setPreviewPage("legal");
  };
  const renderPreviewPage = () => {
    if (previewPage === "venues") return <PublicVenuesListPage subdomain="preview" previewData={{ event: draftEvent as never, venues: listVenues }} />;
    if (previewPage === "offers") return <PublicOffersPage subdomain="preview" previewData={{ event: draftEvent as never, offers: listVenues.filter((venue) => venue.offer_summary).map((venue) => ({ ...venue, offer_summary: venue.offer_summary! })) as OfferVenue[] }} />;
    if (previewPage === "venue" && selectedVenue?.venue_id) return <PublicVenueDetailPage subdomain="preview" venueId={selectedVenue.venue_id} previewData={{ event: draftEvent, venue: selectedVenue as DetailVenueRow, extras: venueExtras }} />;
    if (previewPage === "scan" || previewPage === "checkin" || previewPage === "bonus" || previewPage === "tasting") return <V2ResultPreview page={previewPage} state={pageState} event={{ ...draftEvent, event_id: event.id, name: event.name }} branding={fixtureBranding} venueName={selectedVenue?.name ?? null} />;
    if (previewPage === "join") return <LiveJoinPage subdomain="preview" previewEvent={draftEvent as JoinPreviewEvent} previewState={pageState as JoinPreviewState} />;
    if (previewPage === "prizes") return <AwardsPage subdomain="preview" previewData={{ branding: fixtureBranding, eventInfo: { event_id: event.id, event_name: event.name }, awards: awardEntries, bonuses: [], recentCheckins: [], hasPassport: pageState !== "locked" }} />;
    if (previewPage === "map") return <PublicTrailMapPage subdomain="preview" previewData={{ branding: fixtureBranding, event: { ...draftEvent, event_id: event.id, name: event.name } as MapEventRow, venues: listVenues.map((venue) => ({ ...venue, event_found: true })) }} />;
    if (previewPage === "leaderboard") return <PublicLeaderboardPage subdomain="preview" previewData={{ branding: fixtureBranding, eventId: event.id, rows: !populated ? [] : [{ rank: 1, display_name: "Sample visitor (editor only)", stamps: 3, points: 30, venue_points: 30, bonus_points: 0, visit_count: 3, tier: "Explorer", is_completed: false, is_enabled: true, event_found: true }] }} />;
    if (previewPage === "faq") return <FaqPage subdomain="preview" previewData={{ branding: fixtureBranding, eventInfo: { event_id: event.id, event_name: event.name }, entries: faqEntries }} />;
    if (previewPage === "bookmarks") return <PublicBookmarksPage subdomain="preview" previewData={{ branding: fixtureBranding, eventId: event.id, enabled: true, rows: !populated ? [] : listVenues.slice(0, 2).filter((venue) => venue.venue_id).map((venue) => ({ kind: venue.offer_summary ? "offer" as const : "venue" as const, venue_id: venue.venue_id!, venue_name: venue.name, logo_path: venue.logo_path, cover_path: venue.cover_path, offer_summary: venue.offer_summary, created_at: new Date(0).toISOString() })) }} />;
    if (["terms", "privacy", "legal"].includes(previewPage)) return <CombinedLegalPage subdomain="preview" initialOpen={previewPage === "terms" ? "terms" : previewPage === "privacy" ? "privacy" : "both"} previewData={{ branding: fixtureBranding, row: publicContent?.legal ?? { event_id: event.id, event_name: event.name, legal_source: "local_text", terms_title: "Terms", terms_body: "Sample terms for preview.", terms_url: null, privacy_title: "Privacy", privacy_body: "Sample privacy information for preview.", privacy_url: null, terms_version: null, privacy_version: null, effective_at: null } as LegalRow }} />;
    if (previewPage === "passport") {
      const passport = { passport_id: "preview-passport", event_id: event.id, status: "active", completed_at: null, leaderboard_opt_out: false, email: "preview@example.invalid", full_name: "Sample Visitor", first_name: "Sample", last_name: "Visitor", mobile: null, postcode: null, marketing_opt_in: false, checkin_count: 1 } as PassportRow;
      const stamps = normalizePassportStampRows(listVenues.map((venue, index) => ({ passport_id: passport.passport_id, event_id: event.id, event_name: event.name, venue_label_singular: previewLabels.singular, venue_label_plural: previewLabels.plural, total_venues: listVenues.length, stamped_count: pageState === "empty" ? 0 : pageState === "complete" ? listVenues.length : 1, venue_id: venue.venue_id, venue_name: venue.name, venue_logo_path: venue.logo_path, venue_cover_path: venue.cover_path, order_index: venue.order_index, is_stamped: pageState === "complete" || (pageState !== "empty" && index === 0), checked_in_at: pageState === "complete" || (pageState !== "empty" && index === 0) ? new Date(0).toISOString() : null })));
      return <EventPaletteScope {...brandingScopeProps(fixtureBranding)} className="min-h-screen"><PassportPreview passport={passport} eventName={event.name} stamps={stamps} token="preview" subdomain="preview" branding={fixtureBranding} awards={awardEntries} preview /></EventPaletteScope>;
    }
    return <PublicEventTemplate subdomain={null} event={draftEvent} venues={venues} mode="preview" forceTemplate={previewSource === "live" ? (liveIsV2 ? "v2" : "v1") : "v2"} onPreviewNavigate={previewInteraction === "navigate" ? navigatePreview : undefined} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/40">
      <div className="relative z-[80] shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">V2 visual branding editor</div>
            <h1 className="text-lg font-semibold">{event.name}</h1>
            <div className="text-xs text-muted-foreground">{branding?.public_template_version === "v2" ? "This event is live on V2 — saving updates its live pages." : "This event is live on the existing template — saving keeps V2 as an inactive draft."}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className={`text-xs font-medium ${saveError ? "text-destructive" : hasUnsavedChanges ? "text-amber-700" : "text-emerald-700"}`}>
              {activating ? "Activating…" : saving ? "Saving…" : saveError ? "Save failed" : hasUnsavedChanges ? "Unsaved changes" : saveSuccess ? "Saved" : "All changes saved"}
            </span>
            <Button type="button" variant="outline" onClick={onBack} disabled={busy}>Back to existing editor</Button>
            <Button type="button" variant="outline" onClick={onExit} disabled={busy}>Back to event</Button>
            {canEdit && <Button type="button" variant="outline" onClick={onSave} disabled={busy}>{saving ? "Saving…" : "Save"}</Button>}
            {canEdit && branding?.public_template_version !== "v2" && <Button type="button" variant="outline" onClick={activateV2} disabled={busy}>{activating ? "Activating…" : "Use V2 for this event"}</Button>}
            {canEdit && <Button type="button" onClick={onSaveAndReturn} disabled={busy}>Save and return</Button>}
          </div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="shrink-0">
        {!canEdit && <div className="mx-auto mt-3 max-w-[1800px] px-4"><div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">View-only access. You can inspect settings, but cannot change or save them.</div></div>}
        {(saveError || saveSuccess) && <div className="mx-auto mt-3 max-w-[1800px] px-4"><div role="status" className={`rounded-md border p-3 text-sm ${saveError ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{saveError ?? saveSuccess}</div></div>}
      </div>
      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1800px] grid-cols-[minmax(190px,230px)_minmax(390px,1fr)_minmax(300px,360px)] gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain p-4">
        <nav aria-label="Branding areas" className="min-h-0 overflow-y-auto overscroll-y-contain rounded-md border bg-background p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{previewPage === "home" ? "Landing / home" : previewPage === "venue" ? "Venue detail" : previewPage}</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {(() => {
              const pg = ["terms", "privacy"].includes(previewPage) ? "legal" : previewPage;
              const items = PUBLIC_STYLE_ELEMENTS.filter((item) => (item.page === pg || item.page === "shared") && (renderedIds.has(item.id) || item.id === "shared.navigation.drawer"));
              const sections = [...new Set(items.map((item) => `${item.page === "shared" ? "Shared" : ""}${item.page === "shared" ? " · " : ""}${item.section}`))];
              return sections.map((section) => <div key={section} className="col-span-full"><div className="mb-1 mt-2 text-[11px] font-semibold text-muted-foreground">{section}</div><div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">{items.filter((item) => `${item.page === "shared" ? "Shared · " : ""}${item.section}` === section).map((item) => <button key={item.id} type="button" onClick={() => selectFromNavigator(item.id)} aria-pressed={selectedRole === item.id} className={`rounded-md px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRole === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item.label}</button>)}</div></div>);
            })()}
          </div>
          <div className="mb-2 mt-4 text-xs font-semibold uppercase text-muted-foreground">Shared theme</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {VISUAL_NAV.map((item) => <button key={item.label} type="button" onClick={() => selectFromNavigator(item.role)} aria-pressed={selectedRole === item.role} className={`rounded-md px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRole === item.role ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item.label}</button>)}
          </div>
        </nav>

        <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border bg-background p-3">
          <div className="mb-3 grid min-w-0 gap-2">
            <div className="min-w-0"><h2 className="font-semibold">Real page preview</h2><p className="truncate text-xs text-muted-foreground" title={`Showing ${previewSource}; visitors see ${branding?.public_template_version === "v2" ? "V2" : "V1"}`}><span className="font-semibold text-foreground">Showing: {previewSource === "draft" ? "V2 draft" : previewSource === "saved" ? "Saved V2" : `Live ${liveIsV2 ? "V2" : "V1"}`}</span> · Visitors see {branding?.public_template_version === "v2" ? "V2" : "V1"}</p></div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Select value={previewPage} onValueChange={(value) => setPreviewPage(value as typeof previewPage)}>
              <SelectTrigger className="w-full min-w-0" aria-label="Page"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="home">Home</SelectItem><SelectItem value="join">Join / Start</SelectItem><SelectItem value="passport">Passport</SelectItem><SelectItem value="venues">Venues / Stops</SelectItem><SelectItem value="venue" disabled={!selectedVenue}>Venue detail</SelectItem><SelectItem value="offers">Offers</SelectItem><SelectItem value="prizes">Prizes</SelectItem><SelectItem value="map">Map</SelectItem><SelectItem value="leaderboard">Leaderboard</SelectItem><SelectItem value="faq">FAQ</SelectItem><SelectItem value="terms">Terms</SelectItem><SelectItem value="privacy">Privacy</SelectItem><SelectItem value="legal">Terms / Privacy</SelectItem><SelectItem value="bookmarks">Bookmarks</SelectItem><SelectItem value="scan">Scan (camera off)</SelectItem><SelectItem value="checkin">Check-in result</SelectItem><SelectItem value="bonus">Bonus result</SelectItem><SelectItem value="tasting">Tasting result</SelectItem></SelectContent>
              </Select>
              <div className="inline-flex shrink-0 rounded-md border p-1" aria-label="Preview width">
                <Button type="button" size="icon" variant={previewWidth === "mobile" ? "default" : "ghost"} onClick={() => setPreviewWidth("mobile")} aria-label="Mobile preview" aria-pressed={previewWidth === "mobile"}><Smartphone className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant={previewWidth === "desktop" ? "default" : "ghost"} onClick={() => setPreviewWidth("desktop")} aria-label="Desktop preview" aria-pressed={previewWidth === "desktop"}><Monitor className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="min-w-0 overflow-x-auto overscroll-x-contain">
            <div className="flex min-w-max items-center gap-3">
            <Select value={previewSource} onValueChange={(value) => setPreviewSource(value as typeof previewSource)}>
              <SelectTrigger className="w-44" aria-label="Preview source"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="draft">V2 draft</SelectItem><SelectItem value="saved">Saved V2 config</SelectItem><SelectItem value="live">Live template (read-only)</SelectItem></SelectContent>
            </Select>
            <Select value={sampleState} onValueChange={(value) => setSampleState(value as typeof sampleState)}>
              <SelectTrigger className="w-40" aria-label="Sample state"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="populated">Populated state</SelectItem><SelectItem value="empty">Empty state</SelectItem></SelectContent>
            </Select>
            {pageStates.length > 0 && (
              <Select value={pageState} onValueChange={(value) => setPageStateChoice((prev) => ({ ...prev, [previewPage]: value }))}>
                <SelectTrigger className="w-48" aria-label="Page state"><SelectValue /></SelectTrigger>
                <SelectContent>{pageStates.map(([key, label]) => <SelectItem key={key} value={key}>{label} (sample)</SelectItem>)}</SelectContent>
              </Select>
            )}
            {listVenues.length > 0 && ["venue", "venues", "offers", "map", "passport", "home"].includes(previewPage) && (
              <Select value={selectedVenue?.venue_id ?? ""} onValueChange={(value) => { setSelectedRecord(value); setRecordScope("record"); }}>
                <SelectTrigger className="w-48" aria-label="Record"><SelectValue placeholder={`Choose ${previewLabels.singular.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>{listVenues.filter((venue) => venue.venue_id).map((venue) => <SelectItem key={venue.venue_id!} value={venue.venue_id!}>{venue.name ?? "Untitled"}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <div className="inline-flex rounded-md border p-1" aria-label="Preview interaction">
              <Button type="button" size="sm" variant={previewInteraction === "select" ? "default" : "ghost"} onClick={() => setPreviewInteraction("select")}>Select / Edit</Button>
              <Button type="button" size="sm" variant={previewInteraction === "navigate" ? "default" : "ghost"} onClick={() => setPreviewInteraction("navigate")}>Navigate</Button>
            </div>
            </div>
            </div>
          </div>
          <div className="min-h-0 overflow-hidden rounded-md bg-muted p-3">
            <PreviewFrame width={previewWidth === "mobile" ? 390 : 1280} onDocument={setFrameDoc}>
              <div
                className="v2-brand-preview"
                onClickCapture={(event) => { if (previewInteraction === "select") { event.preventDefault(); event.stopPropagation(); selectFromEvent(event.target); } }}
                onAuxClickCapture={(event) => event.preventDefault()}
                onSubmitCapture={(event) => event.preventDefault()}
                onKeyDownCapture={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); selectFromEvent(event.target); } }}
                onPointerOver={(event) => { const node = event.target as Element; const el = typeof node.closest === "function" ? node.closest<HTMLElement>("[data-brand-role]") : null; setHoveredInstance(el?.dataset.brandInstance ?? el?.dataset.brandRole ?? null); }}
                onPointerLeave={() => setHoveredInstance(null)}
              >
                <style>{`.v2-brand-preview [data-brand-role]{outline:2px solid transparent;outline-offset:-2px;cursor:crosshair}.v2-brand-preview a,.v2-brand-preview button{cursor:crosshair}${hoveredInstance ? `.v2-brand-preview [data-brand-instance="${cssAttr(hoveredInstance)}"],.v2-brand-preview [data-brand-role="${cssAttr(hoveredInstance)}"]:not([data-brand-instance]){outline-color:color-mix(in srgb,#2563EB 60%,transparent)}` : ""}${selectedInstance ? `.v2-brand-preview [data-brand-instance="${cssAttr(selectedInstance)}"],.v2-brand-preview [data-brand-role="${cssAttr(selectedInstance)}"]:not([data-brand-instance]){outline:3px solid #2563EB!important;outline-offset:-3px}` : ""}`}</style>
                <PublicNavProvider mode="preview" subdomain={null} preservePreviewAppearance activePath={previewPage === "home" ? "/" : previewPage === "legal" ? "/terms-privacy" : `/${previewPage === "venue" ? `venues/${selectedVenue?.venue_id ?? "preview"}` : previewPage}`} previewFeatures={previewFeatures} onPreviewNavigate={previewInteraction === "navigate" ? navigatePreview : undefined}>
                  {renderPreviewPage()}
                </PublicNavProvider>
              </div>
            </PreviewFrame>
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto overscroll-y-contain rounded-md border bg-background p-4">
          {!roleMeta && !itemMeta ? <div className="grid min-h-56 place-items-center text-center"><div><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted"><Info className="h-5 w-5" /></div><h2 className="font-semibold">Select something to edit</h2><p className="mt-1 text-sm text-muted-foreground">Click an object in the preview or choose an item from the navigator.</p></div></div> : null}
          {itemMeta ? <ItemStyleInspector
            item={itemMeta} values={(styleState === "normal" ? override?.normal : override?.states?.[styleState]) ?? {}} hasOverride={Boolean(override)}
            inherited={inherited} state={styleState} setState={setStyleState} setProperty={(property, value) => { setItemProperty(property, value); if (typeof value === "string") rememberColour(value); }}
            reset={resetItem} undo={undoStyle} redo={redoStyle} canUndo={stylePast.length > 0} canRedo={styleFuture.length > 0}
            disabled={!canEdit || busy || comparisonReadOnly} clear={() => setSelectedRole(null)} quickColours={quickColours} customFonts={customFonts}
            record={itemMeta.repeat && selectedRecord ? { id: selectedRecord, scope: recordScope, setScope: setRecordScope, label: itemMeta.id === "shared.navigation.tabItem" ? "menu item" : undefined } : null}
          /> : null}
          {itemMeta?.id === "shared.navigation.tabItem" ? <NavigationMenuInspector
            items={navItems} selectedId={selectedRecord} disabled={!canEdit || busy || comparisonReadOnly}
            select={(id) => { setSelectedRecord(id); setRecordScope("record"); }}
            rename={(id, label) => updateNavigationItem(id, { label })}
            changeIcon={(id, icon) => updateNavigationItem(id, { icon })}
            move={moveNavigationItem}
          /> : null}
          {roleMeta && panelRole ? <div className={itemMeta ? "mt-6 border-t pt-4" : ""}>
            <div className="flex items-start justify-between gap-3"><div>{itemMeta ? <div className="text-xs font-semibold uppercase text-muted-foreground">Shared settings for this area</div> : null}<h2 className="text-lg font-semibold">{roleMeta.label}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{roleMeta.description} {itemMeta ? "These affect every item that uses them." : ""}</p></div>{!itemMeta ? <Button type="button" size="icon" variant="ghost" onClick={() => setSelectedRole(null)} aria-label="Clear selection"><X className="h-4 w-4" /></Button> : null}</div>
            <div className="mt-5 space-y-5">
              {panelRole === "brand" && <BrandKitSelector value={form.brand_kit_key} onApplyKit={applyBrandKit} onSelectCustom={selectCustomBrandKit} onClear={clearBrandKit} disabled={!canEdit || busy || comparisonReadOnly} />}
              {panelRole === "fonts" || panelRole === "heroHeading" || panelRole === "welcome" ? <FontPickers headingValue={form.heading_font_family} bodyValue={form.font_family} emotiveValue={form.default_emotive_font_family} onHeadingChange={(value) => setForm((current) => ({ ...current, heading_font_family: value }))} onBodyChange={(value) => setForm((current) => ({ ...current, font_family: value }))} onEmotiveChange={(value) => setForm((current) => ({ ...current, default_emotive_font_family: value }))} disabled={!canEdit || busy || comparisonReadOnly} eventName={event.name} customFonts={customFonts} canUpload={false} onUpload={async () => ({ ok: false as const, error: "Use the existing editor to manage uploaded fonts." })} onDelete={async () => {}} /> : null}
              {panelRole === "welcome" && <Field label="Welcome message">
                <div className="mb-1 text-xs text-muted-foreground">Source: <span className="font-medium text-foreground">{welcomeSource}</span></div>
                <textarea aria-label="Welcome message" value={form.welcome_copy.trim() ? form.welcome_copy : effectiveWelcome} maxLength={1000} disabled={!canEdit || busy || comparisonReadOnly} onChange={(event) => setForm((current) => ({ ...current, welcome_copy: event.target.value }))} className="min-h-28 w-full rounded-md border bg-background p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring" />
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Clearing the box shows the event description again.</span><span>{(form.welcome_copy.trim() ? form.welcome_copy : effectiveWelcome).length}/1000</span></div>
                <Button type="button" variant="ghost" size="sm" disabled={!canEdit || busy || comparisonReadOnly || !welcomeOverride} onClick={() => setForm((current) => ({ ...current, welcome_copy: v1Form.welcome_copy }))}>Use inherited message</Button>
              </Field>}
              {panelRole === "logo" && <><p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Image changes save immediately. Save or discard other form changes first.</p><AssetUploader kind="logo" currentPath={branding?.logo_path ?? null} canEdit={canEdit && !hasUnsavedChanges && !comparisonReadOnly} embedded onUpload={(file) => onAssetUpload("logo", file)} onRemove={() => onAssetRemove("logo")} /><Field label="Logo shape"><Select value={form.logo_shape || "square"} onValueChange={(value) => setForm((current) => ({ ...current, logo_shape: value }))} disabled={!canEdit || busy || comparisonReadOnly}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="square">Square</SelectItem><SelectItem value="circle">Circle</SelectItem></SelectContent></Select></Field><Field label="Logo backdrop"><Select value={form.logo_backdrop || "transparent"} onValueChange={(value) => setForm((current) => ({ ...current, logo_backdrop: value }))} disabled={!canEdit || busy || comparisonReadOnly}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="transparent">Transparent</SelectItem><SelectItem value="color">Colour</SelectItem></SelectContent></Select></Field></>}
              {panelRole === "cover" && <><p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Image changes save immediately. Save or discard other form changes first.</p><AssetUploader kind="cover" currentPath={branding?.cover_path ?? null} canEdit={canEdit && !hasUnsavedChanges && !comparisonReadOnly} embedded onUpload={(file) => onAssetUpload("cover", file)} onRemove={() => onAssetRemove("cover")} />{branding?.cover_path && <CoverPositioner imageUrl={getEventAssetPublicUrl(branding.cover_path)} focalX={form.cover_focal_x ? Number(form.cover_focal_x) : 50} focalY={form.cover_focal_y ? Number(form.cover_focal_y) : 50} disabled={!canEdit || busy || comparisonReadOnly} onChange={(x, y) => setForm((current) => ({ ...current, cover_focal_x: String(x), cover_focal_y: String(y) }))} />}</>}
              {roleMeta.fields.map((field) => <ColourControl key={field} label={COLOUR_LABELS[field]} value={form[field] as string} inherited={resolvedFor(field)} quickColours={quickColours} disabled={!canEdit || busy || comparisonReadOnly} warning={fieldWarnings(field)} onCommit={(value) => { editColour(field, (value ?? "") as Form[typeof field]); if (value) rememberColour(value); }} />)}
              {panelRole === "hero" || panelRole === "cover" ? <HeroOverlayCard colorValue={form.hero_overlay_color} opacityValue={form.hero_overlay_opacity} primaryFallback={form.hero_overlay_color || theme.heroBg} disabled={!canEdit || busy || comparisonReadOnly} onColorChange={(value) => editColour("hero_overlay_color", value)} onOpacityChange={(value) => setForm((current) => ({ ...current, hero_overlay_opacity: value }))} /> : null}
            </div>
          </div> : null}
        </aside>
      </div>
      </div>
    </div>
  );
}

function NavigationMenuInspector({ items, selectedId, disabled, select, rename, changeIcon, move }: {
  items: typeof DEFAULT_PUBLIC_NAVIGATION.items; selectedId: string | null; disabled: boolean;
  select: (id: string) => void; rename: (id: string, label: string) => void;
  changeIcon: (id: string, icon: PublicNavIconId) => void; move: (id: string, direction: -1 | 1) => void;
}) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  if (!selected) return null;
  return <div className="mt-5 space-y-4 border-t pt-4">
    <Field label="Bottom mobile menu item"><Select value={selected.id} onValueChange={select} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Display name"><input aria-label="Bottom menu display name" maxLength={24} value={selected.label} disabled={disabled} onChange={(event) => { const label = event.target.value.slice(0, 24); if (label.trim()) rename(selected.id, label); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></Field>
    <Field label="Icon"><Select value={selected.icon} onValueChange={(value) => changeIcon(selected.id, value as PublicNavIconId)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PUBLIC_NAV_ICON_IDS.map((icon) => <SelectItem key={icon} value={icon}>{icon.replace(/(^|-)(\w)/g, (_, __, letter: string) => ` ${letter.toUpperCase()}`).trim()}</SelectItem>)}</SelectContent></Select></Field>
    <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled || items[0]?.id === selected.id} onClick={() => move(selected.id, -1)}>Move up</Button><Button type="button" variant="outline" size="sm" disabled={disabled || items.at(-1)?.id === selected.id} onClick={() => move(selected.id, 1)}>Move down</Button></div>
    <p className="text-xs text-muted-foreground">Order and names affect display only. Each item keeps its fixed, safe destination.</p>
  </div>;
}

/** Item → the shared Theme panel that also controls it (shown below the item inspector). */
const ITEM_SHARED_ROLE: Partial<Record<string, VisualBrandRole>> = {
  "home.hero.surface": "hero", "home.hero.image": "cover", "home.hero.cover": "cover", "home.hero.logo": "logo",
  "home.hero.heading": "heroHeading", "home.hero.welcomeCopy": "welcome", "home.page.surface": "page",
};

type PublicStyleState = "normal" | "hover" | "focus" | "active" | "disabled";
type QuickColour = { colour: string; label: string };

function dedupeQuick(list: QuickColour[]): QuickColour[] {
  const seen = new Set<string>();
  return list.filter((entry) => {
    if (!HEX_RE.test(entry.colour)) return false;
    const key = entry.colour.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((entry) => ({ ...entry, colour: entry.colour.toUpperCase() })).slice(0, 16);
}

function cssAttr(value: string) { return value.replace(/["\\]/g, "\\$&"); }

/** rgb()/rgba()/hex → #RRGGBB, or "transparent" for fully transparent; "" if unknown. */
export function cssColourToHex(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (HEX_RE.test(v)) return v.toUpperCase();
  if (v === "transparent") return "transparent";
  const match = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!match) return "";
  const alpha = match[4] == null ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  if (alpha === 0) return "transparent";
  return `#${[match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Real responsive viewport: a same-origin iframe whose document mirrors the
 * app's stylesheets/fonts, with the REAL public components portalled in. Media
 * queries, fixed positioning and 100dvh resolve against the frame, not the admin window.
 */
function PreviewFrame({ width, onDocument, children }: { width: number; onDocument: (doc: Document | null) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const iframe = ref.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"></body></html>');
    doc.close();
    doc.documentElement.className = document.documentElement.className;
    const clones = new Map<Node, HTMLElement>();
    const sync = () => {
      const originals = Array.from(document.head.querySelectorAll<HTMLElement>('style, link[rel="stylesheet"]'));
      for (const original of originals) {
        const existing = clones.get(original);
        if (!existing) {
          const clone = original.cloneNode(true) as HTMLElement;
          clones.set(original, clone);
          doc.head.appendChild(clone);
        } else if (original.tagName === "STYLE" && existing.textContent !== original.textContent) {
          existing.textContent = original.textContent;
        }
      }
      for (const [original, clone] of clones) {
        if (!original.isConnected) { clone.remove(); clones.delete(original); }
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    setBody(doc.body);
    onDocument(doc);
    return () => { observer.disconnect(); onDocument(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The iframe keeps its true viewport width (390px or desktop) so the public
  // page's media queries match a real device; the admin column scales it to
  // both the available width and height without changing that viewport.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const update = () => setScale(Math.min(1, box.clientWidth / width, box.clientHeight / 760));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [width]);
  const height = 760;
  return (
    <div ref={boxRef} className="flex h-full min-h-0 w-full items-start justify-center overflow-hidden">
      <div className="relative shrink-0" style={{ width: width * scale, height: height * scale }}>
        <iframe
          ref={ref}
          title="Customer page preview"
          data-testid="v2-preview-frame"
          data-viewport-width={width}
          className="absolute left-0 top-0 block rounded-md border bg-background shadow-sm"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      </div>
      {body ? createPortal(children, body) : null}
    </div>
  );
}

/**
 * One reusable colour control: effective inherited swatch, picker, editable
 * HEX with a local buffer (partial input is never discarded), labelled quick
 * choices and "Use default". Selecting it never writes anything.
 */
function ColourControl({ label, value, inherited, quickColours, disabled, onCommit, warning, allowTransparent }: {
  label: string; value: string | null | undefined; inherited: string; quickColours: QuickColour[];
  disabled: boolean; onCommit: (value: string | null) => void; warning?: React.ReactNode; allowTransparent?: boolean;
}) {
  const current = value && HEX_RE.test(value) ? value.toUpperCase() : "";
  const [draft, setDraft] = useState(current);
  useEffect(() => setDraft(current), [current]);
  const effective = current || inherited;
  const invalid = draft !== "" && draft !== current && !HEX_RE.test(draft);
  const checker = "repeating-conic-gradient(#d4d4d8 0% 25%, #ffffff 0% 50%) 50% / 10px 10px";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><label className="text-sm font-medium">{label}</label><span className="text-[11px] text-muted-foreground">{current ? "Custom" : `Inherited${inherited ? `: ${inherited}` : ""}`}</span></div>
      <div className="flex gap-2">
        <span className="relative h-10 w-12 shrink-0 overflow-hidden rounded border" style={{ background: effective === "transparent" || !effective ? checker : effective }}>
          <input type="color" aria-label={`${label} picker`} value={HEX_RE.test(effective) ? effective : "#FFFFFF"} disabled={disabled} onChange={(event) => onCommit(event.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </span>
        <input aria-label={`${label} hex`} value={draft} placeholder={inherited || "Use default"} disabled={disabled}
          onChange={(event) => { const next = event.target.value.trim(); setDraft(next); if (HEX_RE.test(next)) onCommit(next.toUpperCase()); else if (next === "") onCommit(null); }}
          onBlur={() => { if (!HEX_RE.test(draft) && draft !== "") setDraft(current); }}
          className={`h-10 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm ${invalid ? "border-destructive" : ""}`} />
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !current} onClick={() => onCommit(null)}>Use default</Button>
      </div>
      {invalid ? <p className="text-xs text-destructive">Enter a 6-digit HEX colour such as #1F3D2B.</p> : null}
      <div className="flex flex-wrap gap-1" aria-label={`Quick colours for ${label}`}>
        {allowTransparent ? <button type="button" title="Transparent" aria-label="Use transparent" disabled className="h-6 w-6 rounded-sm border opacity-40" style={{ background: checker }} /> : null}
        {quickColours.map((entry) => <button key={`${entry.label}-${entry.colour}`} type="button" title={`${entry.label} ${entry.colour}`} aria-label={`Use ${entry.label} ${entry.colour}`} disabled={disabled} onClick={() => onCommit(entry.colour)} className={`h-6 w-6 rounded-sm border focus-visible:ring-2 focus-visible:ring-ring ${current === entry.colour ? "ring-2 ring-primary" : ""}`} style={{ backgroundColor: entry.colour }} />)}
      </div>
      {warning}
    </div>
  );
}

/** Numeric input with a local buffer: commits only valid in-range values, shows errors otherwise. */
function NumberControl({ label, property, value, inherited, min, max, step, disabled, onCommit, unit }: {
  label: string; property: PublicStyleProperty; value: number | undefined; inherited?: string;
  min: number; max: number; step: number; disabled: boolean; onCommit: (value: number | null) => void; unit?: string;
}) {
  const current = value == null ? "" : String(value);
  const [draft, setDraft] = useState(current);
  useEffect(() => setDraft(current), [current]);
  const parsed = draft === "" ? null : Number(draft);
  const valid = draft === "" || (parsed != null && publicStylePropertyValue(property, parsed) !== null);
  return (
    <Field label={label}>
      <input type="number" inputMode="decimal" aria-label={label} min={min} max={max} step={step} value={draft} placeholder={inherited ? `${inherited}${unit ?? ""} (inherited)` : "Default"} disabled={disabled}
        onChange={(event) => { const next = event.target.value; setDraft(next); if (next === "") onCommit(null); else if (publicStylePropertyValue(property, Number(next)) !== null) onCommit(Number(next)); }}
        onBlur={() => { if (!valid) setDraft(current); }}
        className={`h-10 w-full rounded-md border bg-background px-3 ${valid ? "" : "border-destructive"}`} />
      {!valid ? <p className="text-xs text-destructive">Use a value from {min} to {max}.</p> : null}
    </Field>
  );
}

const PROPERTY_LABELS: Record<PublicStyleProperty, string> = {
  color: "Text colour", backgroundColor: "Background", borderColor: "Border colour",
  iconColor: "Icon colour", iconBackgroundColor: "Icon background", progressTrackColor: "Track colour",
  progressFillColor: "Fill colour", fontFamily: "Font family", fontSize: "Font size",
  fontWeight: "Font weight", lineHeight: "Line height", textAlign: "Alignment", opacity: "Opacity",
  backgroundGradient: "Gradient",
};

function ItemStyleInspector({ item, values, hasOverride, inherited, state, setState, setProperty, reset, undo, redo, canUndo, canRedo, disabled, clear, quickColours, customFonts, record }: {
  item: PublicStyleElementDefinition; values: Partial<Record<PublicStyleProperty, string | number>>; hasOverride: boolean;
  inherited: Partial<Record<PublicStyleProperty, string>>;
  state: PublicStyleState; setState: (state: PublicStyleState) => void;
  setProperty: (property: PublicStyleProperty, value: string | number | null) => void;
  reset: () => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; disabled: boolean; clear: () => void;
  quickColours: QuickColour[]; customFonts: EventCustomFont[];
  record: { id: string; scope: "record" | "type"; setScope: (scope: "record" | "type") => void; label?: string } | null;
}) {
  const colourProperties = item.properties.filter((property) => property.endsWith("Color") || property === "color");
  const hasTypography = item.properties.includes("fontFamily");
  const [gradient, setGradient] = useState(String(values.backgroundGradient ?? ""));
  useEffect(() => setGradient(String(values.backgroundGradient ?? "")), [values.backgroundGradient]);
  const gradientInvalid = gradient !== "" && publicStylePropertyValue("backgroundGradient", gradient) === null;
  const opacityPercent = typeof values.opacity === "number" ? Math.round(values.opacity * 100) : null;
  return <>
    <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase text-muted-foreground">{record?.scope === "type" ? "All items of this type" : "This item"}</div><h2 className="text-lg font-semibold">{item.label}</h2><p className="mt-1 text-sm text-muted-foreground">Changes only this named item{record?.scope === "record" ? " for this one record" : ""}. Theme and Brand Kit values remain the fallback.</p></div><Button type="button" size="icon" variant="ghost" onClick={clear} aria-label="Clear selection"><X className="h-4 w-4" /></Button></div>
    {record ? <Field label="Apply to"><Select value={record.scope} onValueChange={(value) => record.setScope(value as "record" | "type")} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="record">This one only</SelectItem><SelectItem value="type">Every {record.label ?? (item.repeat === "award" ? "prize" : "venue")} (type default)</SelectItem></SelectContent></Select></Field> : null}
    <div className="mt-4 flex items-center justify-between"><div className="flex gap-1"><Button type="button" size="icon" variant="outline" onClick={undo} disabled={!canUndo || disabled} aria-label="Undo item style"><Undo2 className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" onClick={redo} disabled={!canRedo || disabled} aria-label="Redo item style"><Redo2 className="h-4 w-4" /></Button></div><Button type="button" variant="outline" size="sm" onClick={reset} disabled={disabled || !hasOverride}>Reset this item</Button></div>
    {item.states?.length ? <Field label="Appearance (shown in the preview)"><Select value={state} onValueChange={(value) => setState(value as PublicStyleState)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem>{item.states.map((value) => <SelectItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></Field> : null}
    <div className="mt-5 space-y-4">
      {colourProperties.map((property) => <ColourControl key={property} label={PROPERTY_LABELS[property]} value={values[property] as string | undefined} inherited={inherited[property] ?? ""} quickColours={quickColours} disabled={disabled} allowTransparent={property === "backgroundColor"} onCommit={(value) => setProperty(property, value)} />)}
      {item.properties.includes("opacity") ? <Field label={item.id === "home.hero.cover" ? "Tint layer opacity" : "Opacity"}>
        <div className="flex items-center gap-3">
          <input type="range" aria-label="Opacity" min={0} max={100} step={1} value={opacityPercent ?? Number(inherited.opacity ?? 100)} disabled={disabled} onChange={(event) => setProperty("opacity", Number(event.target.value) / 100)} className="flex-1" />
          <span className="w-16 text-right text-sm tabular-nums">{opacityPercent ?? inherited.opacity ?? 100}%{opacityPercent == null ? " ·inh" : ""}</span>
          <Button type="button" variant="ghost" size="sm" disabled={disabled || opacityPercent == null} onClick={() => setProperty("opacity", null)}>Use default</Button>
        </div>
        {item.id === "home.hero.cover" ? <p className="text-xs text-muted-foreground">Fades the tint layer only (image and text are unaffected). It multiplies the shared overlay strength below.</p> : null}
      </Field> : null}
      {item.properties.includes("backgroundGradient") ? <Field label="Gradient">
        <input aria-label="Gradient" value={gradient} placeholder="Use default, e.g. linear-gradient(180deg,#000000,#333333)" disabled={disabled} onChange={(event) => { const next = event.target.value; setGradient(next); if (next === "") setProperty("backgroundGradient", null); else if (publicStylePropertyValue("backgroundGradient", next) !== null) setProperty("backgroundGradient", next.trim()); }} className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${gradientInvalid ? "border-destructive" : ""}`} />
        {gradientInvalid ? <p className="text-xs text-destructive">Use linear-gradient(…) or radial-gradient(…).</p> : null}
      </Field> : null}
      {hasTypography ? <><Field label="Font family"><Select value={String(values.fontFamily ?? "default")} onValueChange={(value) => setProperty("fontFamily", value === "default" ? null : value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Use default{inherited.fontFamily ? ` (${inherited.fontFamily})` : ""}</SelectItem>{customFonts.map((font) => <SelectItem key={`custom-${font.id}`} value={font.family_name}>{font.family_name} (uploaded)</SelectItem>)}{EVENT_FONTS.map((font) => <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>)}</SelectContent></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <NumberControl label="Font size (px)" property="fontSize" value={values.fontSize as number | undefined} inherited={inherited.fontSize} min={8} max={96} step={1} disabled={disabled} onCommit={(value) => setProperty("fontSize", value)} unit="px" />
          <Field label="Weight"><Select value={String(values.fontWeight ?? "default")} onValueChange={(value) => setProperty("fontWeight", value === "default" ? null : Number(value))} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default{inherited.fontWeight ? ` (${inherited.fontWeight})` : ""}</SelectItem>{[400,500,600,700].map((weight) => <SelectItem key={weight} value={String(weight)}>{weight}</SelectItem>)}</SelectContent></Select></Field>
          <NumberControl label="Line height" property="lineHeight" value={values.lineHeight as number | undefined} inherited={inherited.lineHeight} min={0.8} max={2.5} step={0.1} disabled={disabled} onCommit={(value) => setProperty("lineHeight", value)} />
          <Field label="Alignment"><Select value={String(values.textAlign ?? "default")} onValueChange={(value) => setProperty("textAlign", value === "default" ? null : value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default{inherited.textAlign ? ` (${inherited.textAlign})` : ""}</SelectItem>{["left","center","right"].map((align) => <SelectItem key={align} value={align}>{align}</SelectItem>)}</SelectContent></Select></Field>
        </div></> : null}
    </div>
  </>;
}


// ============================================================================
// Header — top action bar
// ============================================================================
function Header({
  event, primaryDomain, canEdit, saving, onSave, onSaveAndReturn, onCancel, eventId, hasUnsavedChanges,
}: {
  event: EventRow;
  primaryDomain: Domain | null;
  canEdit: boolean;
  saving: boolean;
  onSave: () => void;
  onSaveAndReturn: () => void;
  onCancel: () => void;
  eventId: string;
  hasUnsavedChanges?: boolean;
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
      <div className="flex flex-wrap items-start gap-2">
        <Link to="/admin/events/$eventId" params={{ eventId }}
          className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]">
          ← Back to event
        </Link>
        <div className="flex flex-col items-start">
          <Link to="/admin/events/$eventId/preview" params={{ eventId }} target="_blank"
            title={hasUnsavedChanges
              ? "Full preview shows the last saved branding — save to see your latest edits"
              : "Full preview matches the embedded preview"}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]">
            Open full preview
          </Link>
          {hasUnsavedChanges && (
            <span className="mt-1 max-w-[200px] text-[11px] leading-4 text-[#B45309]">
              Unsaved changes — full preview shows the last saved branding. Save first.
            </span>
          )}
        </div>
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
  value, onApplyKit, onSelectCustom, onClear, disabled,
}: {
  value: string;
  onApplyKit: (kit: BrandKit) => void;
  onSelectCustom: () => void;
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
        <button type="button" onClick={onSelectCustom} disabled={disabled} aria-pressed={value === "custom"}
          className={`flex flex-col gap-2 rounded-[12px] border p-2 text-left transition disabled:opacity-50 ${
          value === "custom" ? "border-[#2F6FE4] ring-2 ring-[#2F6FE4]/30" : "border-[#D9E2EF]"
        }`}>
          <div className="flex h-[78px] items-center justify-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-2xl" aria-hidden>🎨</div>
          <div>
            <div className="text-sm font-semibold text-[#111827]">Custom</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Use only the colours below. No curated Brand Kit or legacy palette will be applied.
            </div>
          </div>
        </button>
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
  label, fieldName, helper, resolved, value, onChange, disabled, warnings,
}: {
  label: string;
  fieldName: string;
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
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);

  // Sync local text with the committed value/resolved fallback ONLY when
  // the field is not focused. This prevents an in-flight edit in Chrome
  // from being clobbered by a re-render triggered by an unrelated field.
  useEffect(() => {
    if (!focused) setText(displayValue);
  }, [displayValue, focused]);

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
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-sm font-medium text-[#334155]">{label}</span>
          <span className="group relative inline-flex shrink-0">
            <Info size={14} className="text-[#94A3B8]" aria-hidden />
            <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-max max-w-[220px] -translate-x-1/2 rounded-[8px] border border-[#D9E2EF] bg-white px-2.5 py-1.5 text-[11px] font-normal text-[#334155] shadow-lg group-hover:block group-focus-within:block">
              Brand field: <span className="font-mono">{fieldName}</span>
            </span>
          </span>
        </div>
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
          // Only commit on `change` (fires when the picker closes). `onInput`
          // fires on every drag frame in Chrome and races with text-input edits.
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-10 w-12 rounded-[10px] border border-[#D9E2EF] bg-white disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => { setFocused(false); commit(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          placeholder="#RRGGBB"
          disabled={disabled}
          maxLength={7}
          className={`h-10 flex-1 rounded-[10px] border bg-white px-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            flash ? "border-[#DC2626] ring-2 ring-[#DC2626]/20" : "border-[#D9E2EF] focus:border-[#2F6FE4]"
          } ${inherited ? "text-[#64748B]" : ""}`}
        />
      </div>
      {inherited && resolved && (
        <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm border border-[#D9E2EF]"
            style={{ backgroundColor: resolved }}
          />
          <span>Resolved: <span className="font-mono">{resolved}</span> (from brand kit / palette)</span>
        </div>
      )}
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
  value, onChange, disabled, label, customFonts = [],
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
  customFonts?: EventCustomFont[];
}) {
  const selected = getEventFont(value);
  const custom = !selected
    ? customFonts.find((f) => f.family_name.toLowerCase() === value.trim().toLowerCase()) ?? null
    : null;
  const isUnknown = !selected && !custom && value.trim().length > 0;
  const selectValue = selected
    ? selected.value
    : custom
      ? custom.family_name
      : isUnknown ? "__unknown__" : "__default__";
  const triggerStack = selected?.stack ?? (custom ? customFontStack(custom.family_name) : undefined);

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
          {customFonts.length > 0 && (
            <SelectGroup>
              <SelectLabel>Your uploaded fonts</SelectLabel>
              {customFonts.map((f) => (
                <SelectItem
                  key={f.id}
                  value={f.family_name}
                  style={{ fontFamily: customFontStack(f.family_name) }}
                >
                  {f.family_name}
                </SelectItem>
              ))}
            </SelectGroup>
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
  customFonts, canUpload, onUpload, onDelete,
}: {
  headingValue: string;
  bodyValue: string;
  emotiveValue: string;
  onHeadingChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onEmotiveChange: (v: string) => void;
  disabled?: boolean;
  eventName: string;
  customFonts: EventCustomFont[];
  canUpload: boolean;
  onUpload: (file: File, familyName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: (font: EventCustomFont) => Promise<void>;
}) {
  const stackFor = (value: string, fallback?: string) => {
    const curated = getEventFont(value)?.stack;
    if (curated) return curated;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const custom = customFonts.find((f) => f.family_name.toLowerCase() === trimmed.toLowerCase());
    return custom ? customFontStack(custom.family_name) : trimmed;
  };
  const headingStack = stackFor(headingValue);
  const bodyStack = stackFor(bodyValue);
  const emotiveStack = stackFor(emotiveValue, "'Caveat', 'Segoe Script', cursive");
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
        customFonts={customFonts}
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
        customFonts={customFonts}
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
        customFonts={customFonts}
      />

      <CustomFontUploader
        fonts={customFonts}
        canUpload={canUpload && !disabled}
        onUpload={onUpload}
        onDelete={onDelete}
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
// CustomFontUploader — upload your own font file (with licensing warning).
// ============================================================================
function CustomFontUploader({
  fonts, canUpload, onUpload, onDelete,
}: {
  fonts: EventCustomFont[];
  canUpload: boolean;
  onUpload: (file: File, familyName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: (font: EventCustomFont) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [familyName, setFamilyName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setFamilyName("");
    setConfirmed(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3 rounded-[12px] border border-[#D9E2EF] bg-white p-4">
      <div>
        <div className="text-sm font-semibold text-[#111827]">Upload your own font</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a brand font in <span className="font-medium">.woff2</span>, <span className="font-medium">.woff</span>,{" "}
          <span className="font-medium">.ttf</span> or <span className="font-medium">.otf</span> (max{" "}
          {Math.round(CUSTOM_FONT_MAX_BYTES / (1024 * 1024))} MB). Once uploaded it appears in the
          heading, body and emotive font lists above.
        </p>
      </div>

      {/* Licensing warning */}
      <div className="flex gap-2 rounded-[10px] border border-[#F5C6A5] bg-[#FFF7ED] p-3">
        <Info className="mt-[2px] h-4 w-4 shrink-0 text-[#B45309]" />
        <p className="text-xs leading-5 text-[#92400E]">
          <span className="font-semibold">You must have permission to use this font.</span>{" "}
          Only upload fonts you own or have a licence for that allows web/embedded use
          (webfont licence). Uploading a font without the rights may breach the font
          licence or copyright, and you are responsible for it — not GetStampd.
        </p>
      </div>

      {fonts.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#64748B]">
            Uploaded fonts
          </div>
          {fonts.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-[#111827]" style={{ fontFamily: customFontStack(f.family_name) }}>
                  {f.family_name}
                </div>
                <div className="text-[11px] text-[#64748B]">.{f.file_format}</div>
              </div>
              <button
                type="button"
                disabled={!canUpload || busy}
                onClick={async () => {
                  if (!window.confirm(`Remove “${f.family_name}”? Any page using it falls back to the default font.`)) return;
                  setBusy(true);
                  await onDelete(f);
                  setBusy(false);
                }}
                className="shrink-0 rounded-[8px] border border-[#E4B7B7] px-2.5 py-1 text-xs font-semibold text-[#B42318] hover:bg-[#FEF3F2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
          disabled={!canUpload || busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setError(null);
            setFile(f);
            if (f) setFamilyName((prev) => prev || suggestFamilyName(f.name));
          }}
          className="block w-full text-xs text-[#334155] file:mr-3 file:rounded-[8px] file:border-0 file:bg-[#EAF2FF] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#2F6FE4]"
        />

        {file && (
          <>
            <Field label="Font name (shown in the font lists)">
              <input
                type="text"
                value={familyName}
                maxLength={60}
                disabled={busy}
                onChange={(e) => setFamilyName(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827]"
                placeholder="e.g. Acme Display"
              />
            </Field>
            <label className="flex items-start gap-2 text-xs text-[#334155]">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-[2px] h-4 w-4 rounded border-[#D9E2EF]"
              />
              <span>
                I confirm I own this font or hold a licence that permits using it on this
                website, and I accept responsibility for its use.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canUpload || busy || !confirmed || familyName.trim().length < 2}
                onClick={async () => {
                  if (!file) return;
                  setBusy(true);
                  setError(null);
                  const res = await onUpload(file, familyName);
                  setBusy(false);
                  if (res.ok) reset();
                  else setError(res.error);
                }}
                className="inline-flex h-9 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-xs font-semibold text-white hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Upload font"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={reset}
                className="inline-flex h-9 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-xs font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="rounded-[8px] border border-[#E4B7B7] bg-[#FEF3F2] px-3 py-2 text-xs text-[#B42318]">
            {error}
          </p>
        )}
        {!canUpload && (
          <p className="text-xs text-muted-foreground">
            You need owner or admin access to upload fonts.
          </p>
        )}
      </div>
    </div>
  );
}




// ============================================================================
// SemanticPreview — sample UI drawn entirely from --event-* tokens.
// ============================================================================
function SemanticPreview({ venueLabelPlural, className = "" }: { venueLabelPlural: string; className?: string }) {
  return (
    <div className={`mt-4 space-y-3 rounded-[12px] p-3 ${className}`}
      data-brand-hint="Page background · Page border"
      style={{ backgroundColor: "var(--event-page-bg)", border: "1px solid var(--event-border)" }}>
      <div data-brand-hint="Page muted text" className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: "var(--event-page-muted)" }}>
        Semantic tokens preview
      </div>
      <div>
        <h4 data-brand-hint="Page heading colour" className="text-base font-semibold" style={{ color: "var(--event-page-heading)" }}>Sample heading</h4>
        <p data-brand-hint="Page body text colour" className="text-sm" style={{ color: "var(--event-page-text)" }}>This body paragraph uses the page body text colour.</p>
        <p data-brand-hint="Page muted text" className="text-xs" style={{ color: "var(--event-page-muted)" }}>This is muted helper text.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex h-9 items-center rounded-[10px] px-3 text-xs font-semibold"
          data-brand-hint="Primary button background · Primary button text"
          style={{ backgroundColor: "var(--event-button-primary-bg)", color: "var(--event-button-primary-fg)" }}>
          Primary button
        </button>
        <button type="button" className="inline-flex h-9 items-center rounded-[10px] border px-3 text-xs font-semibold"
          data-brand-hint="Secondary button background · Secondary button text · Card border"
          style={{ backgroundColor: "var(--event-button-secondary-bg)", color: "var(--event-button-secondary-fg)", borderColor: "var(--event-card-border)" }}>
          Secondary button
        </button>
      </div>
      <div className="rounded-[10px] p-3"
        data-brand-hint="Card background · Card border"
        style={{ backgroundColor: "var(--event-card-bg)", border: "1px solid var(--event-card-border)" }}>
        <div data-brand-hint="Card heading colour" className="text-sm font-semibold" style={{ color: "var(--event-card-heading)" }}>Sample card</div>
        <div data-brand-hint="Card muted text" className="text-xs" style={{ color: "var(--event-card-muted)" }}>
          Sample {venueLabelPlural.toLowerCase().replace(/s$/, "")} address goes here.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-[10px] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
        data-brand-hint="Navigation background · Navigation text / icons"
        style={{ background: "var(--event-nav-bg)", color: "var(--event-nav-muted)" }}>
        <span data-brand-hint="Navigation text / icons" className="text-center" style={{ color: "var(--event-nav-fg)" }}>Home</span>
        <span data-brand-hint="Navigation active text / icons" className="text-center" style={{ color: "var(--event-nav-active-fg)" }}>Map</span>
        <span data-brand-hint="Navigation muted text / icons" className="text-center">More</span>
      </div>
    </div>
  );
}

// ============================================================================
// AssetUploader
// ============================================================================
function AssetUploader({
  kind, currentPath, canEdit, embedded = false, onUpload, onRemove,
}: {
  kind: EventAssetKind;
  currentPath: string | null;
  canEdit: boolean;
  embedded?: boolean;
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
    ? "Shown over the hero image on your event pages and printed on posters."
    : "Wide hero image shown at the top of your event page.";
  const specs = kind === "logo"
    ? [
        "Recommended: 1000 × 1000 px square PNG with a transparent background, under ~300 KB",
        "Minimum: 600 × 600 px (posters print the logo at 288 px)",
        "Leave ~8% clear space inside the square so the circle shape option doesn't clip it",
      ]
    : [
        "Recommended: 1600 × 1200 px (4:3) JPG, under ~500 KB",
        "Minimum: 1200 × 900 px · above 2000 px wide only adds load time",
        "Keep the key subject near the middle, then fine-tune with the focal point positioner",
      ];

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
    <div className={embedded ? "space-y-3" : "space-y-3 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-base font-semibold text-[#111827]">{label}</div>
        <div className="text-[11px] text-[#64748B]">PNG, JPG, WebP · max {limitMB} MB</div>
      </div>
      <p className="text-sm leading-6 text-[#64748B]">{helper}</p>
      <ul className="space-y-1 rounded-[12px] border border-[#DBEAFE] bg-[#F1F6FE] px-3 py-2.5 text-[12px] leading-5 text-[#334155]">
        {specs.map((s) => (
          <li key={s} className="flex gap-2">
            <span aria-hidden className="text-[#2F6FE4]">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>

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

// ============================================================================
// BrandHoverProbe — overlays labelled hotspots on the Live Preview so hovering
// each element reveals which brand-colour field(s) drive its appearance.
// The overlay is pointer-events:none by default; each hotspot re-enables
// pointer events so `title` tooltips fire, and shows a dashed outline on hover.
// ============================================================================
function BrandHoverProbe({ children }: { children: React.ReactNode }) {
  const [activeHint, setActiveHint] = useState<string | null>(null);

  const inferHint = (element: HTMLElement, root: HTMLElement): string | null => {
    const elementStyle = getComputedStyle(element);
    const rootStyle = getComputedStyle(root);
    const normalise = (value: string) => value.replace(/\s+/g, "").toLowerCase();
    const matches = (actual: string, token: string) => {
      const value = rootStyle.getPropertyValue(token).trim();
      if (!value) return false;
      const swatch = document.createElement("span");
      swatch.style.color = value;
      swatch.style.display = "none";
      root.appendChild(swatch);
      const resolved = getComputedStyle(swatch).color;
      swatch.remove();
      return normalise(actual) === normalise(resolved);
    };
    const labels: string[] = [];
    const add = (label: string) => {
      if (!labels.includes(label)) labels.push(label);
    };

    const backgroundRoles = [
      ["--event-card-bg", "Card background"],
      ["--event-button-primary-bg", "Primary button background"],
      ["--event-button-secondary-bg", "Secondary button background"],
      ["--event-nav-bg", "Navigation background"],
      ["--event-hero-bg", "Hero background"],
      ["--event-page-bg", "Page background"],
    ] as const;
    const textRoles = [
      ["--event-card-heading", "Card heading colour"],
      ["--event-card-text", "Card body text colour"],
      ["--event-card-muted", "Card muted text colour"],
      ["--event-button-primary-fg", "Primary button text"],
      ["--event-button-secondary-fg", "Secondary button text"],
      ["--event-nav-active-fg", "Navigation active text / icons"],
      ["--event-nav-muted", "Navigation muted text / icons"],
      ["--event-nav-fg", "Navigation text / icons"],
      ["--event-hero-accent", "Hero accent colour"],
      ["--event-hero-body", "Welcome copy colour"],
      ["--event-hero-fg", "Event heading colour"],
      ["--event-link", "Link colour"],
      ["--event-page-heading", "Page heading colour"],
      ["--event-page-text", "Page body text colour"],
      ["--event-page-muted", "Page muted text colour"],
    ] as const;
    const borderRoles = [
      ["--event-card-border", "Card border colour"],
      ["--event-border", "Page border colour"],
    ] as const;

    backgroundRoles.forEach(([token, label]) => {
      if (elementStyle.backgroundColor !== "rgba(0, 0, 0, 0)" && matches(elementStyle.backgroundColor, token)) add(label);
    });
    textRoles.forEach(([token, label]) => {
      if (matches(elementStyle.color, token)) add(label);
    });
    borderRoles.forEach(([token, label]) => {
      if (elementStyle.borderTopStyle !== "none" && matches(elementStyle.borderTopColor, token)) add(label);
    });

    return labels.length > 0 ? labels.join(" · ") : null;
  };

  const handlePointerOver = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const explicit = target.closest<HTMLElement>("[data-brand-hint]");
    const inferred = inferHint(target, event.currentTarget);
    setActiveHint(
      explicit === target
        ? explicit.dataset.brandHint ?? inferred
        : inferred ?? explicit?.dataset.brandHint ?? null,
    );
  };

  return (
    <div
      className="brand-hover-probe relative"
      onPointerOver={handlePointerOver}
      onPointerLeave={() => setActiveHint(null)}
    >
      <style>{`
        .brand-hover-probe [data-brand-hint] {
          transition: outline-color 120ms ease, background-color 120ms ease;
          outline: 2px dashed transparent;
          outline-offset: 2px;
          border-radius: 6px;
        }
        .brand-hover-probe [data-brand-hint]:hover {
          outline-color: rgba(47, 111, 228, 0.75);
          background-color: rgba(47, 111, 228, 0.06);
          cursor: help;
        }
      `}</style>
      {children}
      {activeHint ? (
        <div
          role="status"
          className="pointer-events-none sticky bottom-3 z-[70] mx-auto -mt-10 w-fit max-w-[calc(100%-1.5rem)] rounded-md bg-[#111827] px-3 py-2 text-center text-xs font-semibold leading-4 text-white shadow-lg"
        >
          {activeHint}
        </div>
      ) : null}
    </div>
  );
}


// ==========================================================================
// CoverPositioner
// ==========================================================================
/**
 * Drag on the cover image to choose which part is visible inside the public
 * hero window. The image is shown at its natural aspect ratio; the overlay
 * marks the ~5:3 window used by the public hero. Coordinates are stored as
 * 0–100 percentages and applied as CSS `object-position`.
 */
function CoverPositioner({
  imageUrl,
  focalX,
  focalY,
  disabled,
  onChange,
}: {
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  disabled?: boolean;
  onChange: (x: number, y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const setFromEvent = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    onChange(clamp(x), clamp(y));
  };

  if (!imageUrl) return null;

  const fx = clamp(focalX);
  const fy = clamp(focalY);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[color:var(--event-text,inherit)]">
          Focal point — drag to choose the visible area
        </span>
        <button
          type="button"
          disabled={disabled}
          className="rounded border px-2 py-1 text-[11px] hover:bg-black/5 disabled:opacity-50"
          onClick={() => onChange(50, 50)}
        >
          Reset to center
        </button>
      </div>
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-md border bg-black/5 ${
          disabled ? "cursor-not-allowed" : "cursor-crosshair"
        } select-none`}
        onPointerDown={(e) => {
          if (disabled) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          setFromEvent(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!dragging || disabled) return;
          setFromEvent(e.clientX, e.clientY);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <img
          src={imageUrl}
          alt="Cover"
          draggable={false}
          className="block h-auto w-full"
        />
        {/* Focal-point crosshair marker. */}
        <div
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60 shadow"
          style={{ left: `${fx}%`, top: `${fy}%` }}
        />
      </div>
      <div className="text-[11px] text-[color:var(--event-muted,inherit)]">
        Focal point: {fx}% × {fy}% (0% = top/left, 100% = bottom/right)
      </div>
    </div>
  );
}


