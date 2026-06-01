import { ReactNode } from "react";
import {
  EventPalette,
  getPalette,
  paletteCssVars,
} from "@/lib/event-palettes";

/**
 * Scopes a curated event palette to its children by setting both CSS
 * custom properties (--event-page-bg, --event-primary, …) and the page
 * background colour on the wrapping element.
 *
 * Render this near the top of public event pages so any descendant that
 * opts into the `--event-*` tokens (or relies on the wrapper's
 * background) automatically picks up the active palette.
 */
export function EventPaletteScope({
  paletteKey,
  children,
  className,
  applyBackground = true,
}: {
  paletteKey: string | null | undefined;
  children: ReactNode;
  className?: string;
  applyBackground?: boolean;
}) {
  const palette: EventPalette | null = getPalette(paletteKey ?? null);
  if (!palette) {
    return <div className={className}>{children}</div>;
  }
  const style: React.CSSProperties = {
    ...paletteCssVars(palette),
    ...(applyBackground ? { backgroundColor: palette.pageBg } : null),
  };
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
