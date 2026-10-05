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
  children,
}: {
  overrides?: PublicStyleOverrideDocument | null;
  children: ReactNode;
}) {
  const document = parsePublicStyleOverrides(overrides);
  const css = publicStyleCss(document);
  return (
    <PublicStyleContext.Provider value={document}>
      <div data-public-style-version={document.version}>
        {css ? <style>{css}</style> : null}
        {children}
      </div>
    </PublicStyleContext.Provider>
  );
}