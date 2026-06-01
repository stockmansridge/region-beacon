import { ReactNode } from "react";
import {
  EventPalette,
  getPalette,
  getPaletteOrDefault,
  paletteCssVars,
} from "@/lib/event-palettes";
import {
  getBackground,
  getBackgroundOrDefault,
} from "@/lib/event-backgrounds";

/**
 * Scopes a curated event palette + page background to its children by
 * setting CSS custom properties (--event-*) and the page background
 * treatment on the wrapping element.
 *
 * Palette and background are independent:
 *   - paletteKey   → colour tokens (primary, accent, card bg, …)
 *   - backgroundKey → background treatment (gradient/texture/etc.)
 *
 * If either is null/unknown, sensible defaults are used so public pages
 * always paint a coherent surface.
 */
export function EventPaletteScope({
  paletteKey,
  backgroundKey,
  children,
  className,
  applyBackground = true,
}: {
  paletteKey: string | null | undefined;
  backgroundKey?: string | null | undefined;
  children: ReactNode;
  className?: string;
  applyBackground?: boolean;
}) {
  // If neither palette nor explicit background is set, render an
  // un-themed wrapper so legacy pages keep their previous look.
  const explicitPalette: EventPalette | null = getPalette(paletteKey ?? null);
  const explicitBackground = getBackground(backgroundKey ?? null);
  if (!explicitPalette && !explicitBackground) {
    return <div className={className}>{children}</div>;
  }

  const palette = getPaletteOrDefault(paletteKey);
  const background = getBackgroundOrDefault(backgroundKey);

  const style: React.CSSProperties = {
    ...paletteCssVars(palette),
    ...(applyBackground ? background.build(palette) : null),
  };
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
