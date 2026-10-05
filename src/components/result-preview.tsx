// Shared plumbing so the app-owned result screens (Scan, Check-in, Bonus,
// Tasting) render the SAME view in the public controller and in the V2 editor
// preview. Outside the preview provider nothing changes (exact V1 behaviour).
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { PublicLink } from "@/components/public-nav-context";
import { useEventBrandingKeys, type EventBrandingKeys } from "@/lib/use-event-palette";

const ResultPreviewContext = createContext<{ preview: boolean; branding: EventBrandingKeys | null }>({ preview: false, branding: null });

/**
 * Editor-only. `branding` is the event's resolved keys (exactly what the public
 * controller would load), injected so views never fetch, store or claim and the
 * view applies the SAME version-specific palette profile as its public render.
 */
export function ResultPreviewProvider({ children, branding = null }: { children: ReactNode; branding?: EventBrandingKeys | null }) {
  return <ResultPreviewContext.Provider value={{ preview: true, branding }}>{children}</ResultPreviewContext.Provider>;
}

export function useResultPreview() {
  return useContext(ResultPreviewContext).preview;
}

/** Public: loads the event's keys by host. Preview: returns the injected keys and never fetches. */
export function useResultBranding(subdomain: string | null): EventBrandingKeys {
  const ctx = useContext(ResultPreviewContext);
  const loaded = useEventBrandingKeys(ctx.preview ? null : subdomain);
  return ctx.preview && ctx.branding ? ctx.branding : loaded;
}

/** Same scope in public and preview (preview injects branding, so no outer provider is needed). */
export function ResultPaletteScope({ children, className, ...props }: ComponentProps<typeof EventPaletteScope>) {
  const ctx = useContext(ResultPreviewContext);
  if (ctx.preview && !ctx.branding) return <div className={className}>{children}</div>;
  return <EventPaletteScope {...props} className={className}>{children}</EventPaletteScope>;
}

/** Plain in-event anchor: public keeps the original <a href>; preview routes through PublicLink and stays inside the preview. */
export function ResultAnchor({ href, className, children, style }: { href: string; className?: string; children: ReactNode; style?: React.CSSProperties }) {
  const preview = useResultPreview();
  if (preview) return <PublicLink to={href} className={className} style={style}>{children}</PublicLink>;
  return <a href={href} className={className} style={style}>{children}</a>;
}

/** Public: router Link (unchanged). Preview: PublicLink, which stays inside the preview. */
export function ResultLink({ to, params, children, ...rest }: { to: string; params?: Record<string, string>; className?: string; children: ReactNode; style?: React.CSSProperties } & Record<`data-${string}`, string | undefined>) {
  const preview = useResultPreview();
  if (preview) return <PublicLink to={to} params={params} {...rest}>{children}</PublicLink>;
  return <Link to={to as never} params={params as never} {...rest}>{children}</Link>;
}
