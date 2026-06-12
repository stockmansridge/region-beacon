// Central event theme resolver.
//
// Public passport pages MUST consume branding through this helper (via
// <EventPaletteScope>) so every page gets a consistent set of editable
// semantic colour tokens. Adding a new colour token? Add it here and
// expose it as a CSS variable in `themeCssVars` — every wrapped page
// picks it up for free.

import type { CSSProperties } from "react";
import {
  EventPalette,
  buildCustomPalette,
  getPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";
import { resolveBackgroundBaseHex } from "@/lib/event-backgrounds";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export type EventTheme = {
  pageBg: string;        // --event-page-bg
  cardBg: string;        // --event-card-bg
  primary: string;       // --event-primary
  primaryText: string;   // --event-primary-fg (text on primary)
  // Page-surface text (directly on page background).
  pageText: string;      // --event-page-fg
  pageMuted: string;     // --event-page-muted
  // Card-surface text (inside card_bg surfaces). Falls back to page
  // text when card-specific overrides are not set.
  cardText: string;      // --event-card-fg
  cardMuted: string;     // --event-card-muted
  accent: string;        // --event-accent
  border: string;        // --event-border
  // Navigation surface (sticky top header, mobile bottom nav, drawer).
  navBg: string;         // --event-nav-bg
  navText: string;       // --event-nav-fg
  navMuted: string;      // --event-nav-muted
  navActiveBg: string;   // --event-nav-active-bg
  navActiveText: string; // --event-nav-active-fg
};

export type BrandingInput = {
  palette_key?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  page_background_color?: string | null;
  card_background_color?: string | null;
  // Legacy single text/muted columns — fall back to both page and card
  // surfaces when card-specific values are absent.
  text_color?: string | null;
  muted_text_color?: string | null;
  // Card-surface overrides. When set, only the card surface uses them;
  // the page surface continues to use text_color/muted_text_color.
  card_text_color?: string | null;
  card_muted_text_color?: string | null;
  border_color?: string | null;
  primary_text_color?: string | null;
  // Navigation surface background (header, bottom nav, drawer). When
  // null, falls back to primary_color so existing events look identical.
  nav_background_color?: string | null;
  // Background key only influences whether custom page/card hex overrides
  // are honoured (parity with existing EventPaletteScope behaviour).
  page_background_key?: string | null;
};

function pickHex(value: string | null | undefined): string | null {
  if (!value) return null;
  return HEX_RE.test(value) ? value : null;
}

/**
 * Resolve the active theme for an event row.
 *
 * Precedence per role:
 *   1. Card-specific override (card_text_color, card_muted_text_color)
 *   2. Page-level explicit semantic column (text_color, muted_text_color, …)
 *   3. Curated palette value
 *   4. Custom palette derived from primary_color / accent_color
 *   5. Default palette (classic_vineyard)
 *
 * Page/card backgrounds keep the existing rule: custom hex values only
 * take over when page_background_key === 'custom_color'.
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

  const isCustomBg = input.page_background_key === "custom_color";
  const customPageBg = isCustomBg ? pickHex(input.page_background_color) : null;
  const customCardBg = isCustomBg ? pickHex(input.card_background_color) : null;
  // For non-custom background styles, compute the resolved page bg from
  // the chosen style so contrast checks (and any consumer reading
  // --event-page-bg) reflect what the user actually sees on the page.
  const resolvedPageBg = isCustomBg
    ? (customPageBg ?? palette.pageBg)
    : resolveBackgroundBaseHex(input.page_background_key ?? null, palette);


  const border = pickHex(input.border_color) ?? palette.border;
  const primaryText =
    pickHex(input.primary_text_color) ?? palette.primaryForeground;

  // Page-surface text (lives directly on pageBg).
  const pageText =
    pickHex(input.text_color) ?? palette.heading ?? palette.bodyText;
  const pageMuted = pickHex(input.muted_text_color) ?? palette.mutedText;
  // Card-surface text overrides — fall back to page text so existing
  // events keep their current look when card_*_color columns are NULL.
  const cardText = pickHex(input.card_text_color) ?? pageText;
  const cardMuted = pickHex(input.card_muted_text_color) ?? pageMuted;

  const navBg = pickHex(input.nav_background_color) ?? palette.primary;
  // Nav text/muted derive from primaryText so contrast on a dark nav
  // surface stays readable regardless of the page/card text colours.
  const navText = primaryText;
  const navMuted = `color-mix(in srgb, ${navText} 72%, transparent)`;
  // Subtle active pill behind the icon, tinted with nav text colour.
  const navActiveBg = `color-mix(in srgb, ${navText} 12%, transparent)`;
  // Keep the historical accent-based active indicator so the active item
  // remains visually obvious even when nav bg ≈ accent.
  const navActiveText = palette.accent;

  return {
    pageBg: resolvedPageBg,
    cardBg: customCardBg ?? palette.cardBg,
    primary: palette.primary,
    primaryText,
    pageText,
    pageMuted,
    cardText,
    cardMuted,
    accent: palette.accent,
    border,
    navBg,
    navText,
    navMuted,
    navActiveBg,
    navActiveText,
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
 * inside cards. Components that paint text directly on the page
 * background should switch to --event-page-fg / --event-page-muted to
 * stay readable when the user picks contrasting page and card
 * backgrounds.
 */
export function themeCssVars(theme: EventTheme): CSSProperties {
  const style: Record<string, string> = {
    "--event-page-bg": theme.pageBg,
    "--event-card-bg": theme.cardBg,
    "--event-primary": theme.primary,
    "--event-primary-fg": theme.primaryText,
    "--event-page-fg": theme.pageText,
    "--event-page-muted": theme.pageMuted,
    "--event-card-fg": theme.cardText,
    "--event-card-muted": theme.cardMuted,
    // --event-text / --event-muted resolve to the card-surface values.
    "--event-text": theme.cardText,
    "--event-muted": theme.cardMuted,
    "--event-accent": theme.accent,
    "--event-border": theme.border,
    // Navigation surface tokens — header, bottom nav, drawer paint from
    // these so the nav can be styled independently of buttons.
    "--event-nav-bg": theme.navBg,
    "--event-nav-fg": theme.navText,
    "--event-nav-muted": theme.navMuted,
    "--event-nav-active-bg": theme.navActiveBg,
    "--event-nav-active-fg": theme.navActiveText,
    // Derived: secondary/muted text on primary/dark surfaces (header, bottom
    // nav, drawer). Derived from --event-primary-fg so it stays readable on
    // --event-primary regardless of the event's content Muted Text choice.
    // Never use --event-muted on primary surfaces — use this instead.
    "--event-on-primary-muted": `color-mix(in srgb, ${theme.primaryText} 72%, transparent)`,
    // Legacy aliases — keep until every public page is migrated.
    "--event-heading": theme.cardText,
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
