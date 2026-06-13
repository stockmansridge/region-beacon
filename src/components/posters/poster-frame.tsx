import type { CSSProperties, ReactNode } from "react";

// A4 portrait at 96 DPI = 794 × 1123 CSS px. We render posters at this
// fixed size in an offscreen-positioned container so html-to-image
// captures the exact same pixels we preview. The on-screen preview uses
// CSS transform: scale() to shrink the same 794px-wide node down to fit
// the admin layout.

export const POSTER_WIDTH_PX = 794;
export const POSTER_HEIGHT_PX = 1123;

type Props = {
  children: ReactNode;
  /** Background colour applied to the entire A4 sheet. */
  background?: string;
  /** Text colour applied at the sheet root (children may override). */
  color?: string;
  /** Font family applied at the sheet root (children may override). */
  fontFamily?: string | null;
  /** id used by export to find the node. */
  id?: string;
  /** When true, the node is rendered at full A4 px (used for export). */
  capture?: boolean;
  /** Scale factor for on-screen preview. Ignored when capture=true. */
  previewScale?: number;
  className?: string;
};

/**
 * Fixed A4 frame used by every poster. Always rendered at the full
 * 794×1123 px so export is pixel-deterministic; the preview wraps it in
 * a scaled container instead of resizing the frame itself.
 */
export function PosterFrame({
  children,
  background = "#ffffff",
  color = "#0f172a",
  fontFamily,
  id,
  capture = false,
  previewScale = 0.55,
  className,
}: Props) {
  const sheetStyle: CSSProperties = {
    width: `${POSTER_WIDTH_PX}px`,
    height: `${POSTER_HEIGHT_PX}px`,
    background,
    color,
    fontFamily:
      fontFamily ??
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    overflow: "hidden",
    position: "relative",
    boxSizing: "border-box",
  };

  if (capture) {
    return (
      <div id={id} className={className} style={sheetStyle}>
        {children}
      </div>
    );
  }

  // Preview wrapper: shrinks the full-size sheet so it fits the layout
  // without affecting export fidelity.
  const wrapperStyle: CSSProperties = {
    width: `${POSTER_WIDTH_PX * previewScale}px`,
    height: `${POSTER_HEIGHT_PX * previewScale}px`,
    overflow: "hidden",
    background: "#f1f5f9",
    borderRadius: 12,
    boxShadow: "0 12px 32px -16px rgba(15,23,42,0.25)",
  };
  const innerStyle: CSSProperties = {
    transform: `scale(${previewScale})`,
    transformOrigin: "top left",
  };
  return (
    <div className={className} style={wrapperStyle}>
      <div style={innerStyle}>
        <div id={id} style={sheetStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
