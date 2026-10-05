// Shared plumbing so the app-owned result screens (Scan, Check-in, Bonus,
// Tasting) render the SAME view in the public controller and in the V2 editor
// preview. Outside the preview provider nothing changes (exact V1 behaviour).
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { PublicLink } from "@/components/public-nav-context";

const ResultPreviewContext = createContext(false);

/** Editor-only: the surrounding canonical V2 scope supplies branding; views must not fetch, store or claim. */
export function ResultPreviewProvider({ children }: { children: ReactNode }) {
  return <ResultPreviewContext.Provider value>{children}</ResultPreviewContext.Provider>;
}

export function useResultPreview() {
  return useContext(ResultPreviewContext);
}

/** Public: the view's original palette scope. Preview: inherit the editor's event scope (no nested provider). */
export function ResultPaletteScope({ children, className, ...props }: ComponentProps<typeof EventPaletteScope>) {
  const preview = useResultPreview();
  if (preview) return <div className={className}>{children}</div>;
  return <EventPaletteScope {...props} className={className}>{children}</EventPaletteScope>;
}

/** Public: router Link (unchanged). Preview: PublicLink, which stays inside the preview. */
export function ResultLink({ to, params, children, ...rest }: { to: string; params?: Record<string, string>; className?: string; children: ReactNode; style?: React.CSSProperties } & Record<`data-${string}`, string | undefined>) {
  const preview = useResultPreview();
  if (preview) return <PublicLink to={to} params={params} {...rest}>{children}</PublicLink>;
  return <Link to={to as never} params={params as never} {...rest}>{children}</Link>;
}
