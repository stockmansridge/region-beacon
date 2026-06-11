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

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export type EventTheme = {
  pageBg: string;        // --event-page-bg
  cardBg: string;        // --event-card-bg
  primary: string;       // --event-primary
  primaryText: string;   // --event-primary-fg (text on primary)
  text: string;          // --event-text       (main text)
  muted: string;         // --event-muted      (helper text)
  accent: string;        // --event-accent
  border: string;        // --event-border
};

export type BrandingInput = {
  palette_key?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  page_background_color?: string | null;
  card_background_color?: string | null;
  // New semantic-role columns. Optional; fall back to palette when null.
  text_color?: string | null;
  muted_text_color?: string | null;
  border_color?: string | null;
  primary_text_color?: string | null;
  // Background key only influences whether custom page/card hex overrides
  // are honoured (parity with existing EventPaletteScope behaviour).
  page_background_key?: string | null;
};

function pickHex(value: string | null | undefined): string | null {
  if (!value) return null;
  return HEX_RE.test(value) ? value : null;
}

/**
 * Resolve the active 8-role theme for an event row.
 *
 * Precedence per role:
 *   1. Explicit semantic column on event_branding (text_color, …)
 *   2. Curated palette value (when palette_key resolves)
 *   3. Custom palette derived from primary_color / accent_color
 *   4. Default palette (classic_vineyard)
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

  // Explicit semantic overrides win over palette values.
  const text = pickHex(input.text_color) ?? palette.heading ?? palette.bodyText;
  const muted = pickHex(input.muted_text_color) ?? palette.mutedText;
  const border = pickHex(input.border_color) ?? palette.border;
  const primaryText = pickHex(input.primary_text_color) ?? palette.primaryForeground;

  return {
    pageBg: customPageBg ?? palette.pageBg,
    cardBg: customCardBg ?? palette.cardBg,
    primary: palette.primary,
    primaryText,
    text,
    muted,
    accent: palette.accent,
    border,
  };
}

/**
 * Emit CSS custom properties for an event theme. Spread onto a wrapper
 * element's `style` prop. Includes legacy aliases so older pages still
 * referencing --event-heading / --event-body / --event-visited /
 * --event-pin keep rendering until they are migrated.
 */
export function themeCssVars(theme: EventTheme): CSSProperties {
  const style: Record<string, string> = {
    "--event-page-bg": theme.pageBg,
    "--event-card-bg": theme.cardBg,
    "--event-primary": theme.primary,
    "--event-primary-fg": theme.primaryText,
    "--event-text": theme.text,
    "--event-muted": theme.muted,
    "--event-accent": theme.accent,
    "--event-border": theme.border,
    // Derived: secondary/muted text on primary/dark surfaces (header, bottom
    // nav, drawer). Derived from --event-primary-fg so it stays readable on
    // --event-primary regardless of the event's content Muted Text choice.
    // Never use --event-muted on primary surfaces — use this instead.
    "--event-on-primary-muted": `color-mix(in srgb, ${theme.primaryText} 72%, transparent)`,
    // Legacy aliases — keep until every public page is migrated.
    "--event-heading": theme.text,
    "--event-body": theme.text,
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
