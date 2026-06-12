import { ReactNode } from "react";
import { resolveEventTheme, themeCssVars } from "@/lib/event-theme";
import { getBackground, getBackgroundOrDefault } from "@/lib/event-backgrounds";
import {
  buildCustomPalette,
  getPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Scopes a curated event palette + page background to its children by
 * setting CSS custom properties (--event-*) and the page background
 * treatment on the wrapping element.
 *
 * Colour resolution is delegated to `resolveEventTheme` so every public
 * page consumes the same 8 semantic roles:
 *   --event-page-bg, --event-card-bg,
 *   --event-primary, --event-primary-fg,
 *   --event-text, --event-muted,
 *   --event-accent, --event-border
 *
 * Legacy vars (--event-heading, --event-body, --event-visited,
 * --event-pin) are emitted as aliases for back-compat.
 */
export function EventPaletteScope({
  paletteKey,
  backgroundKey,
  primaryColor,
  accentColor,
  pageBackgroundColor,
  cardBackgroundColor,
  textColor,
  mutedTextColor,
  cardTextColor,
  cardMutedTextColor,
  borderColor,
  primaryTextColor,
  navBackgroundColor,
  fontFamily,
  children,
  className,
  applyBackground = true,
}: {
  paletteKey: string | null | undefined;
  backgroundKey?: string | null | undefined;
  primaryColor?: string | null;
  accentColor?: string | null;
  pageBackgroundColor?: string | null;
  cardBackgroundColor?: string | null;
  textColor?: string | null;
  mutedTextColor?: string | null;
  cardTextColor?: string | null;
  cardMutedTextColor?: string | null;
  borderColor?: string | null;
  primaryTextColor?: string | null;
  navBackgroundColor?: string | null;
  fontFamily?: string | null;
  children: ReactNode;
  className?: string;
  applyBackground?: boolean;
}) {
  const hasCustomPalette =
    paletteKey === "custom" ||
    (!paletteKey && (primaryColor || accentColor));
  const explicitCurated = getPalette(paletteKey ?? null);
  const explicitBackground = getBackground(backgroundKey ?? null);
  const hasSemanticOverride =
    (textColor && HEX_RE.test(textColor)) ||
    (mutedTextColor && HEX_RE.test(mutedTextColor)) ||
    (cardTextColor && HEX_RE.test(cardTextColor)) ||
    (cardMutedTextColor && HEX_RE.test(cardMutedTextColor)) ||
    (borderColor && HEX_RE.test(borderColor)) ||
    (primaryTextColor && HEX_RE.test(primaryTextColor)) ||
    (navBackgroundColor && HEX_RE.test(navBackgroundColor));

  if (
    !explicitCurated &&
    !hasCustomPalette &&
    !explicitBackground &&
    !hasSemanticOverride &&
    !fontFamily
  ) {
    return <div className={className}>{children}</div>;
  }

  const theme = resolveEventTheme({
    palette_key: paletteKey ?? null,
    primary_color: primaryColor ?? null,
    accent_color: accentColor ?? null,
    page_background_color: pageBackgroundColor ?? null,
    card_background_color: cardBackgroundColor ?? null,
    text_color: textColor ?? null,
    muted_text_color: mutedTextColor ?? null,
    card_text_color: cardTextColor ?? null,
    card_muted_text_color: cardMutedTextColor ?? null,
    border_color: borderColor ?? null,
    primary_text_color: primaryTextColor ?? null,
    nav_background_color: navBackgroundColor ?? null,
    page_background_key: backgroundKey ?? null,
  });

  // Page background painting still respects the curated background
  // treatments (gradients/patterns). Custom hex page bg is honoured
  // only when "custom_color" background is selected.
  const isCustomBackground = backgroundKey === "custom_color";
  let bgStyle: React.CSSProperties = {};
  if (applyBackground) {
    if (
      isCustomBackground &&
      pageBackgroundColor &&
      HEX_RE.test(pageBackgroundColor)
    ) {
      bgStyle = { backgroundColor: pageBackgroundColor };
    } else {
      // Curated background treatments need an EventPalette; build a
      // minimal one from the resolved theme so gradients still derive
      // from the right primary/accent.
      const basePalette =
        paletteKey === "custom" || (!paletteKey && (primaryColor || accentColor))
          ? buildCustomPalette(primaryColor ?? null, accentColor ?? null)
          : getPaletteOrDefault(paletteKey);
      const paletteForBg = {
        ...basePalette,
        pageBg: theme.pageBg,
        cardBg: theme.cardBg,
      };
      bgStyle = getBackgroundOrDefault(backgroundKey).build(paletteForBg);
    }
  }

  const style: React.CSSProperties = {
    ...themeCssVars(theme),
    ...bgStyle,
    ...(fontFamily
      ? { fontFamily, ["--event-font" as any]: fontFamily }
      : {}),
  };
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
