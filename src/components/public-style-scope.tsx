import { createContext, useContext, type ReactNode } from "react";
import {
  parsePublicStyleOverrides,
  publicStyleCss,
  publicStyleTarget,
  type PublicStyleElementId,
  type PublicStyleOverrideDocument,
} from "@/lib/public-style-overrides";

const PublicStyleContext = createContext<PublicStyleOverrideDocument | null>(null);

export function usePublicStyleTarget(
  id: PublicStyleElementId,
  options?: { recordId?: string | null; selectable?: boolean },
) {
  return publicStyleTarget(useContext(PublicStyleContext), id, options);
}

export function PublicStyleScope({
  overrides,
  enabled = true,
  children,
}: {
  overrides?: PublicStyleOverrideDocument | null;
  enabled?: boolean;
  children: ReactNode;
}) {
  const document = enabled ? parsePublicStyleOverrides(overrides) : parsePublicStyleOverrides(null);
  const css = publicStyleCss(document);
  return (
    <PublicStyleContext.Provider value={document}>
      <div {...(enabled ? { "data-public-style-version": document.version } : {})}>
        {css ? <style>{css}</style> : null}
        {children}
      </div>
    </PublicStyleContext.Provider>
  );
}