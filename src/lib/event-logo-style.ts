/**
 * Event logo presentation — ONE definition shared by every surface.
 *
 * The logo is rendered over busy hero photography (public landing hero) and on
 * printed posters, so organisers can choose:
 *
 *   shape    : square (rounded corners) | circle
 *   backdrop : transparent | color  (solid plate behind the mark)
 *
 * DB fields: public.event_branding.logo_shape / logo_backdrop /
 * logo_backdrop_color. NULL means "square + transparent", which reproduces the
 * pre-existing look exactly, so events created before the columns existed are
 * unchanged.
 *
 * Do NOT re-derive these styles inside a route, component, or poster — import
 * from here so the branding preview, the live page and the PDFs agree.
 */

export type EventLogoShape = "square" | "circle";
export type EventLogoBackdrop = "transparent" | "color";

export const DEFAULT_LOGO_SHAPE: EventLogoShape = "square";
export const DEFAULT_LOGO_BACKDROP: EventLogoBackdrop = "transparent";
/** Used when the organiser picks "colour" but has not chosen one yet. */
export const DEFAULT_LOGO_BACKDROP_COLOR = "#ffffff";

export type EventLogoStyleInput = {
  shape?: string | null;
  backdrop?: string | null;
  backdropColor?: string | null;
};

export type ResolvedEventLogoStyle = {
  shape: EventLogoShape;
  backdrop: EventLogoBackdrop;
  /** null when the backdrop is transparent. */
  backdropColor: string | null;
};

export function parseLogoShape(value: string | null | undefined): EventLogoShape {
  return value === "circle" ? "circle" : DEFAULT_LOGO_SHAPE;
}

export function parseLogoBackdrop(value: string | null | undefined): EventLogoBackdrop {
  return value === "color" ? "color" : DEFAULT_LOGO_BACKDROP;
}

export function resolveEventLogoStyle(
  input: EventLogoStyleInput | null | undefined,
): ResolvedEventLogoStyle {
  const shape = parseLogoShape(input?.shape);
  const backdrop = parseLogoBackdrop(input?.backdrop);
  const raw = input?.backdropColor?.trim();
  return {
    shape,
    backdrop,
    backdropColor:
      backdrop === "color" ? (raw && raw.length > 0 ? raw : DEFAULT_LOGO_BACKDROP_COLOR) : null,
  };
}

/**
 * Inline style for the element that wraps the <img>. Plain CSS values only so
 * the same object works in the DOM and in html2canvas-captured posters.
 *
 * `size` is the box edge in px. Padding scales with the box so a small hero
 * logo and a large poster logo keep the same visual proportions.
 */
export function eventLogoBoxStyle(
  style: ResolvedEventLogoStyle,
  size: number,
): Record<string, string | number> {
  const hasPlate = style.backdrop === "color" && style.backdropColor;
  return {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    padding: hasPlate ? Math.round(size * 0.12) : 0,
    borderRadius: style.shape === "circle" ? "9999px" : `${Math.max(8, Math.round(size * 0.12))}px`,
    ...(hasPlate
      ? {
          backgroundColor: style.backdropColor as string,
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.45)",
        }
      : {
          // No plate: a soft shadow keeps a transparent mark readable on a
          // light patch of hero photography.
          filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.45))",
        }),
  };
}

/** Inline style for the logo <img> itself. */
export function eventLogoImageStyle(): Record<string, string | number> {
  return {
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    display: "block",
  };
}
