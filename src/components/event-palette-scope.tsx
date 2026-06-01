import { ReactNode } from "react";
import {
  EventPalette,
  getPalette,
  getPaletteOrDefault,
  buildCustomPalette,
  paletteCssVars,
} from "@/lib/event-palettes";
import {
  getBackground,
  getBackgroundOrDefault,
} from "@/lib/event-backgrounds";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Scopes a curated event palette + page background to its children by
 * setting CSS custom properties (--event-*) and the page background
 * treatment on the wrapping element.
 *
 * Palette and background are independent:
 *   - paletteKey            → curated palette key (or "custom")
 *   - primaryColor/accentColor → used when paletteKey is null or "custom"
 *   - backgroundKey         → background treatment key (or "custom_color")
 *   - pageBackgroundColor   → custom hex page bg, used with "custom_color"
 *   - cardBackgroundColor   → optional custom hex card surface
 *
 * If nothing is set, renders an un-themed wrapper so legacy pages keep
 * their previous look.
 */
export function EventPaletteScope({
  paletteKey,
  backgroundKey,
  primaryColor,
  accentColor,
  pageBackgroundColor,
  cardBackgroundColor,
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
  children: ReactNode;
  className?: string;
  applyBackground?: boolean;
}) {
  const hasCustomPalette =
    paletteKey === "custom" ||
    (!paletteKey && (primaryColor || accentColor));
  const explicitCurated: EventPalette | null = getPalette(paletteKey ?? null);
  const explicitBackground = getBackground(backgroundKey ?? null);

  if (!explicitCurated && !hasCustomPalette && !explicitBackground) {
    return <div className={className}>{children}</div>;
  }

  let palette: EventPalette;
  if (paletteKey === "custom" || hasCustomPalette) {
    palette = buildCustomPalette(primaryColor ?? null, accentColor ?? null);
  } else {
    palette = getPaletteOrDefault(paletteKey);
  }

  // Optional card override
  if (cardBackgroundColor && HEX_RE.test(cardBackgroundColor)) {
    palette = { ...palette, cardBg: cardBackgroundColor };
  }

  const background = getBackgroundOrDefault(backgroundKey);

  let bgStyle: React.CSSProperties = {};
  if (applyBackground) {
    if (
      backgroundKey === "custom_color" &&
      pageBackgroundColor &&
      HEX_RE.test(pageBackgroundColor)
    ) {
      bgStyle = { backgroundColor: pageBackgroundColor };
    } else {
      bgStyle = background.build(palette);
    }
  }

  const style: React.CSSProperties = {
    ...paletteCssVars(palette),
    ...bgStyle,
  };
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
