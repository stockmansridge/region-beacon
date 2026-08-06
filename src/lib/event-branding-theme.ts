/**
 * Canonical event_branding select list + branding → theme prop mapping.
 *
 * Every surface that renders the customer landing page (public subdomain
 * route, admin draft full preview, branding editor embedded preview) MUST
 * read branding through these constants and map it to <EventPaletteScope />
 * with `brandingToScopeProps`. This removes the drift where one route
 * selected a reduced column list and emitted only a handful of semantic
 * CSS variables, so the same event looked like a legacy default theme.
 */
import { getEventFont } from "@/lib/event-fonts";

/** Columns present on every deployment. */
export const EVENT_BRANDING_SELECT_BASE = [
  "logo_path", "cover_path",
  "font_family", "heading_font_family", "default_emotive_font_family",
  "welcome_copy", "terms_url",
  "venue_label_singular", "venue_label_plural",
  "primary_color", "accent_color", "link_color",
  "page_background_color", "text_color", "muted_text_color", "border_color",
  "page_heading_color", "page_body_color", "page_muted_color",
  "card_background_color", "card_text_color", "card_muted_text_color", "card_border_color",
  "card_heading_color", "card_body_color", "card_muted_color",
  "primary_text_color",
  "button_primary_bg", "button_primary_fg", "button_secondary_bg", "button_secondary_fg",
  "nav_background_color", "nav_fg_color", "nav_muted_color", "nav_active_fg_color",
  "hero_bg_color", "hero_fg_color", "hero_accent_color", "hero_body_color",
  "hero_overlay_color", "hero_overlay_opacity",
  "brand_kit_key", "brand_kit_version",
  "palette_key", "page_background_key",
] as const;

/** Columns that may be missing on older production databases. */
export const EVENT_BRANDING_SELECT_OPTIONAL = [
  "cover_focal_x", "cover_focal_y",
  "logo_shape", "logo_backdrop", "logo_backdrop_color",
] as const;

export const EVENT_BRANDING_SELECT = [
  ...EVENT_BRANDING_SELECT_BASE,
  ...EVENT_BRANDING_SELECT_OPTIONAL,
].join(", ");

export const EVENT_BRANDING_SELECT_FALLBACK = EVENT_BRANDING_SELECT_BASE.join(", ");

/** True when a failed select is caused by a column missing in production. */
export function isMissingBrandingColumnError(message: string | null | undefined): boolean {
  return /(logo_shape|logo_backdrop|logo_backdrop_color|cover_focal_x|cover_focal_y|hero_body_color|brand_kit_key|brand_kit_version|hero_overlay|page_heading_color|card_heading_color|button_primary_bg|nav_fg_color|hero_bg_color|link_color|page_background_color|card_background_color|palette_key|page_background_key)/i.test(
    message ?? "",
  );
}

export type EventBrandingRow = {
  logo_path?: string | null;
  cover_path?: string | null;
  font_family?: string | null;
  heading_font_family?: string | null;
  default_emotive_font_family?: string | null;
  welcome_copy?: string | null;
  terms_url?: string | null;
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  link_color?: string | null;
  page_background_color?: string | null;
  text_color?: string | null;
  muted_text_color?: string | null;
  border_color?: string | null;
  page_heading_color?: string | null;
  page_body_color?: string | null;
  page_muted_color?: string | null;
  card_background_color?: string | null;
  card_text_color?: string | null;
  card_muted_text_color?: string | null;
  card_border_color?: string | null;
  card_heading_color?: string | null;
  card_body_color?: string | null;
  card_muted_color?: string | null;
  primary_text_color?: string | null;
  button_primary_bg?: string | null;
  button_primary_fg?: string | null;
  button_secondary_bg?: string | null;
  button_secondary_fg?: string | null;
  nav_background_color?: string | null;
  nav_fg_color?: string | null;
  nav_muted_color?: string | null;
  nav_active_fg_color?: string | null;
  hero_bg_color?: string | null;
  hero_fg_color?: string | null;
  hero_accent_color?: string | null;
  hero_body_color?: string | null;
  hero_overlay_color?: string | null;
  hero_overlay_opacity?: number | null;
  brand_kit_key?: string | null;
  brand_kit_version?: number | null;
  palette_key?: string | null;
  page_background_key?: string | null;
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  logo_shape?: string | null;
  logo_backdrop?: string | null;
  logo_backdrop_color?: string | null;
};

/** Resolve a stored font_family value to a usable CSS font stack. */
export function resolveFontStack(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return getEventFont(trimmed)?.stack ?? trimmed;
}

/**
 * Maps a branding row to the full <EventPaletteScope /> prop set. Includes
 * every semantic token role so --event-page-*, --event-card-*,
 * --event-*-button-*, --event-nav-* and --event-hero-* are all emitted.
 */
export function brandingToScopeProps(b: EventBrandingRow | null | undefined) {
  return {
    paletteKey: b?.palette_key ?? null,
    backgroundKey: b?.page_background_key ?? null,
    brandKitKey: b?.brand_kit_key ?? null,

    primaryColor: b?.primary_color ?? null,
    accentColor: b?.accent_color ?? null,
    linkColor: b?.link_color ?? null,

    pageBackgroundColor: b?.page_background_color ?? null,
    textColor: b?.page_heading_color ?? b?.text_color ?? null,
    mutedTextColor: b?.page_muted_color ?? b?.muted_text_color ?? null,
    borderColor: b?.border_color ?? null,

    cardBackgroundColor: b?.card_background_color ?? null,
    cardTextColor: b?.card_heading_color ?? b?.card_text_color ?? null,
    cardMutedTextColor: b?.card_muted_color ?? b?.card_muted_text_color ?? null,
    cardBorderColor: b?.card_border_color ?? null,

    primaryTextColor: b?.button_primary_fg ?? b?.primary_text_color ?? null,
    buttonPrimaryBg: b?.button_primary_bg ?? null,
    buttonPrimaryFg: b?.button_primary_fg ?? null,
    buttonSecondaryBg: b?.button_secondary_bg ?? null,
    buttonSecondaryFg: b?.button_secondary_fg ?? null,

    navBackgroundColor: b?.nav_background_color ?? null,
    navFgColor: b?.nav_fg_color ?? null,
    navMutedColor: b?.nav_muted_color ?? null,
    navActiveFgColor: b?.nav_active_fg_color ?? null,

    heroBgColor: b?.hero_bg_color ?? null,
    heroFgColor: b?.hero_fg_color ?? null,
    heroAccentColor: b?.hero_accent_color ?? null,
    heroBodyColor: b?.hero_body_color ?? null,

    fontFamily: resolveFontStack(b?.font_family),
    headingFontFamily: resolveFontStack(b?.heading_font_family),
  };
}

/** Hero-specific props shared by every TrailLanding call site. */
export function brandingToHeroProps(b: EventBrandingRow | null | undefined) {
  return {
    heroOverlayColor: b?.hero_overlay_color ?? null,
    heroOverlayOpacity:
      typeof b?.hero_overlay_opacity === "number" ? b.hero_overlay_opacity : null,
    heroFocalX: typeof b?.cover_focal_x === "number" ? b.cover_focal_x : null,
    heroFocalY: typeof b?.cover_focal_y === "number" ? b.cover_focal_y : null,
    fontFamily: resolveFontStack(b?.font_family) ?? undefined,
    headingFontFamily: resolveFontStack(b?.heading_font_family) ?? undefined,
  };
}
