import { createContext, useContext, useId, type ReactNode } from "react";
import {
  parsePublicStyleOverrides,
  publicStyleCss,
  publicStyleTarget,
  type PublicStyleElementId,
  type PublicStyleOverrideDocument,
} from "@/lib/public-style-overrides";

type PublicStyleContextValue = { enabled: boolean; document: PublicStyleOverrideDocument | null };
const PublicStyleContext = createContext<PublicStyleContextValue>({ enabled: false, document: null });

export function usePublicStyleTarget(
  id: PublicStyleElementId,
  options?: { recordId?: string | null; selectable?: boolean },
) {
  const context = useContext(PublicStyleContext);
  return context.enabled
    ? publicStyleTarget(context.document, id, options)
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
}: {
  overrides?: PublicStyleOverrideDocument | null;
  enabled?: boolean;
  children: ReactNode;
}) {
  const scope = `ps${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const document = parsePublicStyleOverrides(overrides);
  if (!enabled) return children;
  const css = publicStyleCss(document, scope);
  return (
    <PublicStyleContext.Provider value={{ enabled: true, document }}>
      <div data-public-style-version={document.version} data-public-style-root={scope}>
        {css ? <style>{css}</style> : null}
        {children}
      </div>
    </PublicStyleContext.Provider>
  );
}
