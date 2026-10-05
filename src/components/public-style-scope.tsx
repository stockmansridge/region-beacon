import { createContext, useContext, useEffect, useId, type ReactNode } from "react";
import { buildGoogleFontsHref, isSupportedEventFont } from "@/lib/event-fonts";
import { ensureCustomFontFaces } from "@/lib/event-custom-fonts";
import {
  parsePublicStyleOverrides,
  publicStyleCss,
  publicStyleTarget,
  type PublicStyleElementId,
  type PublicStyleOverrideDocument,
} from "@/lib/public-style-overrides";

type PublicStyleContextValue = { enabled: boolean; document: PublicStyleOverrideDocument | null; eventId: string | null };
const PublicStyleContext = createContext<PublicStyleContextValue>({ enabled: false, document: null, eventId: null });

export function usePublicStyleTarget(
  id: PublicStyleElementId,
  options?: { recordId?: string | null; selectable?: boolean },
) {
  const context = useContext(PublicStyleContext);
  return context.enabled
    ? publicStyleTarget(context.document, id, { ...options, eventId: context.eventId })
    : { style: {} };
}

/**
 * V2-only item style scope. Emitted CSS is confined to this instance's unique
 * root attribute so two event scopes in one document cannot affect each other.
 * Disabled (V1) renders children directly with no wrapper.
 */
export function PublicStyleScope({
  overrides,
  enabled = true,
  children,
  eventId,
}: {
  overrides?: PublicStyleOverrideDocument | null;
  enabled?: boolean;
  children: ReactNode;
  eventId?: string | null;
}) {
  const scope = `ps${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const document = parsePublicStyleOverrides(overrides);
  // Item-only font overrides must load in preview AND public output.
  const fonts = enabled ? itemFonts(document) : [];
  const fontKey = fonts.join("|");
  useEffect(() => {
    if (!fontKey || typeof window === "undefined") return;
    const list = fontKey.split("|");
    const href = buildGoogleFontsHref(list);
    if (href && !window.document.querySelector(`link[data-event-font="${href}"]`)) {
      const link = window.document.createElement("link");
      link.rel = "stylesheet"; link.href = href; link.dataset.eventFont = href;
      window.document.head.appendChild(link);
    }
    const custom = list.filter((family) => !isSupportedEventFont(family));
    if (custom.length) void ensureCustomFontFaces(custom, eventId ?? undefined);
  }, [fontKey, eventId]);
  if (!enabled) return children;
  const css = publicStyleCss(document, scope, eventId);
  return (
    <PublicStyleContext.Provider value={{ enabled: true, document, eventId: eventId ?? null }}>
      <div data-public-style-version={document.version} data-public-style-root={scope}>
        {css ? <style>{css}</style> : null}
        {children}
      </div>
    </PublicStyleContext.Provider>
  );
}

function itemFonts(document: PublicStyleOverrideDocument): string[] {
  const fonts = new Set<string>();
  const collect = (item: { normal?: Record<string, unknown>; states?: Record<string, Record<string, unknown> | undefined> }) => {
    for (const values of [item.normal, ...Object.values(item.states ?? {})]) {
      if (typeof values?.fontFamily === "string") fonts.add(values.fontFamily);
    }
  };
  Object.values(document.items).forEach(collect);
  Object.values(document.records ?? {}).forEach((records) => Object.values(records).forEach(collect));
  return Array.from(fonts).sort();
}
