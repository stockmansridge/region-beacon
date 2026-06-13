import { ReactNode, useEffect } from "react";
import { resolveEventTheme, themeCssVars } from "@/lib/event-theme";
import { getBackground, getBackgroundOrDefault } from "@/lib/event-backgrounds";
import {
  buildCustomPalette,
  getPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";
import { buildGoogleFontsHref } from "@/lib/event-fonts";

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
  // Phase D — Brand Kit additions (all optional, all fall back).
  brandKitKey,
  linkColor,
  cardBorderColor,
  buttonPrimaryBg,
  buttonPrimaryFg,
  buttonSecondaryBg,
  buttonSecondaryFg,
  navFgColor,
  navMutedColor,
  navActiveFgColor,
  heroBgColor,
  heroFgColor,
  heroAccentColor,
  fontFamily,
  headingFontFamily,
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
  brandKitKey?: string | null;
  linkColor?: string | null;
  cardBorderColor?: string | null;
  buttonPrimaryBg?: string | null;
  buttonPrimaryFg?: string | null;
  buttonSecondaryBg?: string | null;
  buttonSecondaryFg?: string | null;
  navFgColor?: string | null;
  navMutedColor?: string | null;
  navActiveFgColor?: string | null;
  heroBgColor?: string | null;
  heroFgColor?: string | null;
  heroAccentColor?: string | null;
  fontFamily?: string | null;
  headingFontFamily?: string | null;
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
    (navBackgroundColor && HEX_RE.test(navBackgroundColor)) ||
    !!brandKitKey ||
    (linkColor && HEX_RE.test(linkColor)) ||
    (cardBorderColor && HEX_RE.test(cardBorderColor)) ||
    (buttonPrimaryBg && HEX_RE.test(buttonPrimaryBg)) ||
    (buttonPrimaryFg && HEX_RE.test(buttonPrimaryFg)) ||
    (buttonSecondaryBg && HEX_RE.test(buttonSecondaryBg)) ||
    (buttonSecondaryFg && HEX_RE.test(buttonSecondaryFg)) ||
    (navFgColor && HEX_RE.test(navFgColor)) ||
    (navMutedColor && HEX_RE.test(navMutedColor)) ||
    (navActiveFgColor && HEX_RE.test(navActiveFgColor)) ||
    (heroBgColor && HEX_RE.test(heroBgColor)) ||
    (heroFgColor && HEX_RE.test(heroFgColor)) ||
    (heroAccentColor && HEX_RE.test(heroAccentColor));

  // Lazy-load Google Fonts for the body + heading families when the
  // chosen value matches a known EVENT_FONTS entry. Idempotent. Called
  // unconditionally so React's rules-of-hooks are respected even if we
  // bail out below with an unstyled wrapper.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const href = buildGoogleFontsHref([fontFamily, headingFontFamily]);
    if (!href) return;
    if (document.querySelector(`link[data-event-font="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.eventFont = href;
    document.head.appendChild(link);
  }, [fontFamily, headingFontFamily]);

  if (
    !explicitCurated &&
    !hasCustomPalette &&
    !explicitBackground &&
    !hasSemanticOverride &&
    !fontFamily &&
    !headingFontFamily
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
    brand_kit_key: brandKitKey ?? null,
    link_color: linkColor ?? null,
    card_border_color: cardBorderColor ?? null,
    button_primary_bg: buttonPrimaryBg ?? null,
    button_primary_fg: buttonPrimaryFg ?? null,
    button_secondary_bg: buttonSecondaryBg ?? null,
    button_secondary_fg: buttonSecondaryFg ?? null,
    nav_fg_color: navFgColor ?? null,
    nav_muted_color: navMutedColor ?? null,
    nav_active_fg_color: navActiveFgColor ?? null,
    hero_bg_color: heroBgColor ?? null,
    hero_fg_color: heroFgColor ?? null,
    hero_accent_color: heroAccentColor ?? null,
  });

  // Page background painting still respects the curated background
  // treatments (gradients/patterns). Custom hex page bg is honoured
  // only when "custom_color" background is selected.
  const isCustomBackground = backgroundKey === "custom_color";
  // Phase D: once a Brand Kit is selected, the legacy curated background
  // treatments (which paint from the palette's pageBg) are no longer
  // authoritative — the resolved `--event-page-bg` token wins. Same for
  // events that set an explicit page_background_color hex.
  const hasBrandKit = !!brandKitKey;
  const hasExplicitPageBg =
    !!pageBackgroundColor && HEX_RE.test(pageBackgroundColor);
  let bgStyle: React.CSSProperties = {};
  if (applyBackground) {
    if (
      isCustomBackground &&
      pageBackgroundColor &&
      HEX_RE.test(pageBackgroundColor)
    ) {
      bgStyle = { backgroundColor: pageBackgroundColor };
    } else if (hasBrandKit || hasExplicitPageBg) {
      // Paint directly from the resolved semantic token so the page bg
      // matches the Brand Kit / explicit page_background_color rather
      // than the legacy curated background treatment.
      bgStyle = { backgroundColor: theme.pageBg };
    } else {
      // Legacy path: curated background treatments need an EventPalette;
      // build from the base palette so style formulas (e.g. soft_tint
      // mixing pageBg + primary) compute against the raw palette colours.
      const basePalette =
        paletteKey === "custom" || (!paletteKey && (primaryColor || accentColor))
          ? buildCustomPalette(primaryColor ?? null, accentColor ?? null)
          : getPaletteOrDefault(paletteKey);
      bgStyle = getBackgroundOrDefault(backgroundKey).build(basePalette);
    }
  }

  const style: React.CSSProperties = {
    ...themeCssVars(theme),
    ...bgStyle,
    ...(fontFamily
      ? { fontFamily, ["--event-font" as any]: fontFamily }
      : {}),
    ...(headingFontFamily
      ? { ["--event-heading-font" as any]: headingFontFamily }
      : {}),
  };
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
