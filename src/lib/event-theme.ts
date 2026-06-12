// Central event theme resolver.
//
// Public passport pages MUST consume branding through this helper (via
// <EventPaletteScope>) so every page gets a consistent set of editable
// semantic colour tokens. Adding a new colour token? Add it here and
// expose it as a CSS variable in `themeCssVars` — every wrapped page
// picks it up for free.
//
// Phase D: extended with semantic Brand Kit roles (buttons, nav text,
// hero band, card border, link). Every new field is optional — when
// null the resolver falls back to legacy palette/colour values so
// events without `brand_kit_key` render byte-identically to before.

import type { CSSProperties } from "react";
import {
  EventPalette,
  buildCustomPalette,
  getPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";
import { resolveBackgroundBaseHex } from "@/lib/event-backgrounds";
import { getBrandKit } from "@/lib/event-brand-kits";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export type EventTheme = {
  pageBg: string;        // --event-page-bg
  cardBg: string;        // --event-card-bg
  primary: string;       // --event-primary
  primaryText: string;   // --event-primary-fg (text on primary)
  // Page-surface text (directly on page background).
  pageHeading: string;   // --event-page-heading
  pageText: string;      // --event-page-fg / --event-page-text
  pageMuted: string;     // --event-page-muted
  // Card-surface text (inside card_bg surfaces). Falls back to page
  // text when card-specific overrides are not set.
  cardHeading: string;   // --event-card-heading
  cardText: string;      // --event-card-fg / --event-card-text
  cardMuted: string;     // --event-card-muted
  accent: string;        // --event-accent
  border: string;        // --event-border (page surface)
  cardBorder: string;    // --event-card-border
  link: string;          // --event-link
  // Buttons
  buttonPrimaryBg: string;   // --event-button-primary-bg
  buttonPrimaryFg: string;   // --event-button-primary-fg
  buttonSecondaryBg: string; // --event-button-secondary-bg
  buttonSecondaryFg: string; // --event-button-secondary-fg
  // Navigation surface (sticky top header, mobile bottom nav, drawer).
  navBg: string;         // --event-nav-bg
  navText: string;       // --event-nav-fg
  navMuted: string;      // --event-nav-muted
  navActiveBg: string;   // --event-nav-active-bg
  navActiveText: string; // --event-nav-active-fg
  // Hero band
  heroBg: string;        // --event-hero-bg
  heroFg: string;        // --event-hero-fg
  heroAccent: string;    // --event-hero-accent
};

export type BrandingInput = {
  // ---- Legacy palette / background ----
  palette_key?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  page_background_color?: string | null;
  card_background_color?: string | null;
  text_color?: string | null;
  muted_text_color?: string | null;
  card_text_color?: string | null;
  card_muted_text_color?: string | null;
  border_color?: string | null;
  primary_text_color?: string | null;
  nav_background_color?: string | null;
  page_background_key?: string | null;

  // ---- Phase D additions (all optional, all fall back) ----
  brand_kit_key?: string | null;
  link_color?: string | null;
  card_border_color?: string | null;
  button_primary_bg?: string | null;
  button_primary_fg?: string | null;
  button_secondary_bg?: string | null;
  button_secondary_fg?: string | null;
  nav_fg_color?: string | null;
  nav_muted_color?: string | null;
  nav_active_fg_color?: string | null;
  hero_bg_color?: string | null;
  hero_fg_color?: string | null;
  hero_accent_color?: string | null;

  // ---- Phase D Pass 2 — heading/body/muted split (all optional) ----
  page_heading_color?: string | null;
  page_body_color?: string | null;
  page_muted_color?: string | null;
  card_heading_color?: string | null;
  card_body_color?: string | null;
  card_muted_color?: string | null;
};

function pickHex(value: string | null | undefined): string | null {
  if (!value) return null;
  return HEX_RE.test(value) ? value : null;
}

/**
 * Resolve the active theme for an event row.
 *
 * Precedence per role:
 *   1. Explicit semantic column on the row (the organiser tweaked it)
 *   2. Brand-kit value (looked up by brand_kit_key)
 *   3. Legacy curated palette / palette-derived value
 *   4. Hard-coded default (from clean_minimal palette)
 *
 * Events with brand_kit_key === null AND no Phase-D columns set
 * resolve exactly as before — every new role falls back to a value
 * derived from the legacy palette.
 */
export function resolveEventTheme(input: BrandingInput): EventTheme {
  let palette: EventPalette;
  if (input.palette_key && input.palette_key !== "custom") {
    palette = getPaletteOrDefault(input.palette_key);
  } else if (
    input.palette_key === "custom" ||
    input.primary_color ||
    input.accent_color
  ) {
    palette = buildCustomPalette(
      input.primary_color ?? null,
      input.accent_color ?? null,
    );
  } else {
    palette = getPaletteOrDefault(null);
  }

  // Brand Kit values become priority-2 fallbacks per role. They never
  // override a column the organiser has set — that's already applied
  // server-side by writing the kit's values into the columns, but we
  // still honour the kit here so a partially-rolled-out kit (or a
  // legacy row that gets brand_kit_key set without column writes)
  // still resolves to a coherent theme.
  const kit = getBrandKit(input.brand_kit_key ?? null);
  const kc = kit?.colors;

  const isCustomBg = input.page_background_key === "custom_color";
  const customPageBg = isCustomBg ? pickHex(input.page_background_color) : null;
  const customCardBg = isCustomBg ? pickHex(input.card_background_color) : null;
  const legacyPageBg = isCustomBg
    ? (customPageBg ?? palette.pageBg)
    : resolveBackgroundBaseHex(input.page_background_key ?? null, palette);

  // Page surface
  const pageBg = pickHex(input.page_background_color) ?? kc?.page_background_color ?? legacyPageBg;
  const pageText = pickHex(input.page_body_color) ?? pickHex(input.text_color) ?? kc?.text_color ?? palette.heading ?? palette.bodyText;
  const pageHeading = pickHex(input.page_heading_color) ?? pickHex(input.text_color) ?? kc?.text_color ?? pageText;
  const pageMuted = pickHex(input.page_muted_color) ?? pickHex(input.muted_text_color) ?? kc?.muted_text_color ?? palette.mutedText;
  const border = pickHex(input.border_color) ?? kc?.border_color ?? palette.border;

  // Card surface
  const cardBg = pickHex(input.card_background_color) ?? kc?.card_background_color ?? customCardBg ?? palette.cardBg;
  const cardText = pickHex(input.card_body_color) ?? pickHex(input.card_text_color) ?? kc?.card_text_color ?? pageText;
  const cardHeading = pickHex(input.card_heading_color) ?? pickHex(input.card_text_color) ?? kc?.card_text_color ?? cardText;
  const cardMuted = pickHex(input.card_muted_color) ?? pickHex(input.card_muted_text_color) ?? kc?.card_muted_text_color ?? pageMuted;
  const cardBorder = pickHex(input.card_border_color) ?? kc?.card_border_color ?? border;

  // Brand / link
  const primary = pickHex(input.primary_color) ?? kc?.primary_color ?? palette.primary;
  const accent = pickHex(input.accent_color) ?? kc?.accent_color ?? palette.accent;
  const primaryText = pickHex(input.primary_text_color) ?? kc?.button_primary_fg ?? palette.primaryForeground;
  const link = pickHex(input.link_color) ?? kc?.link_color ?? primary;

  // Buttons — default primary to (--event-primary, --event-primary-fg)
  const buttonPrimaryBg = pickHex(input.button_primary_bg) ?? kc?.button_primary_bg ?? primary;
  const buttonPrimaryFg = pickHex(input.button_primary_fg) ?? kc?.button_primary_fg ?? primaryText;
  const buttonSecondaryBg = pickHex(input.button_secondary_bg) ?? kc?.button_secondary_bg ?? cardBg;
  const buttonSecondaryFg = pickHex(input.button_secondary_fg) ?? kc?.button_secondary_fg ?? cardText;

  // Navigation surface
  const navBg = pickHex(input.nav_background_color) ?? kc?.nav_background_color ?? palette.primary;
  const navText = pickHex(input.nav_fg_color) ?? kc?.nav_fg_color ?? primaryText;
  const navMuted = pickHex(input.nav_muted_color) ?? kc?.nav_muted_color ?? `color-mix(in srgb, ${navText} 72%, transparent)`;
  const navActiveBg = `color-mix(in srgb, ${navText} 12%, transparent)`;
  const navActiveText = pickHex(input.nav_active_fg_color) ?? kc?.nav_active_fg_color ?? accent;

  // Hero band — default to nav surface for back-compat with current
  // public pages that paint hero with primary/primary-fg.
  const heroBg = pickHex(input.hero_bg_color) ?? kc?.hero_bg_color ?? primary;
  const heroFg = pickHex(input.hero_fg_color) ?? kc?.hero_fg_color ?? primaryText;
  const heroAccent = pickHex(input.hero_accent_color) ?? kc?.hero_accent_color ?? accent;

  return {
    pageBg, cardBg,
    primary, primaryText,
    pageHeading, pageText, pageMuted,
    cardHeading, cardText, cardMuted,
    accent, border, cardBorder, link,
    buttonPrimaryBg, buttonPrimaryFg,
    buttonSecondaryBg, buttonSecondaryFg,
    navBg, navText, navMuted, navActiveBg, navActiveText,
    heroBg, heroFg, heroAccent,
  };
}

/**
 * Emit CSS custom properties for an event theme. Spread onto a wrapper
 * element's `style` prop. Includes legacy aliases so older pages still
 * referencing --event-heading / --event-body / --event-visited /
 * --event-pin keep rendering until they are migrated.
 *
 * --event-text and --event-muted are aliased to the CARD surface
 * variants because the vast majority of text on public pages lives
 * inside cards.
 */
export function themeCssVars(theme: EventTheme): CSSProperties {
  const style: Record<string, string> = {
    // Page / card surfaces
    "--event-page-bg": theme.pageBg,
    "--event-card-bg": theme.cardBg,
    "--event-page-heading": theme.pageHeading,
    "--event-page-text": theme.pageText,
    "--event-page-fg": theme.pageText,
    "--event-page-muted": theme.pageMuted,
    "--event-card-heading": theme.cardHeading,
    "--event-card-text": theme.cardText,
    "--event-card-fg": theme.cardText,
    "--event-card-muted": theme.cardMuted,
    "--event-border": theme.border,
    "--event-card-border": theme.cardBorder,
    // Brand
    "--event-primary": theme.primary,
    "--event-primary-fg": theme.primaryText,
    "--event-accent": theme.accent,
    "--event-link": theme.link,
    // Buttons
    "--event-button-primary-bg": theme.buttonPrimaryBg,
    "--event-button-primary-fg": theme.buttonPrimaryFg,
    "--event-button-secondary-bg": theme.buttonSecondaryBg,
    "--event-button-secondary-fg": theme.buttonSecondaryFg,
    "--event-button-secondary-border": `color-mix(in srgb, ${theme.buttonSecondaryFg} 24%, transparent)`,
    // Navigation
    "--event-nav-bg": theme.navBg,
    "--event-nav-fg": theme.navText,
    "--event-nav-muted": theme.navMuted,
    "--event-nav-active-bg": theme.navActiveBg,
    "--event-nav-active-fg": theme.navActiveText,
    // Hero
    "--event-hero-bg": theme.heroBg,
    "--event-hero-fg": theme.heroFg,
    "--event-hero-accent": theme.heroAccent,
    "--event-hero-overlay": `color-mix(in srgb, ${theme.heroBg} 70%, transparent)`,
    "--event-hero-overlay-strong": `color-mix(in srgb, ${theme.heroBg} 88%, transparent)`,
    // Derived: muted text on primary/dark surfaces.
    "--event-on-primary-muted": `color-mix(in srgb, ${theme.primaryText} 72%, transparent)`,
    // ---- Legacy aliases — keep until every public page is migrated ----
    "--event-text": theme.cardText,
    "--event-muted": theme.cardMuted,
    "--event-heading": theme.cardHeading,
    "--event-body": theme.cardText,
    "--event-visited": theme.primary,
    "--event-pin": theme.accent,
  };
  return style as CSSProperties;
}

/** Convenience: shape returned by get_public_event_by_domain → theme. */
export function themeFromPublicEventRow(
  row: BrandingInput | null | undefined,
): EventTheme {
  return resolveEventTheme(row ?? {});
}
