import type { ReactNode } from "react";
import {
  parsePublicStyleOverrides,
  publicStyleCss,
  type PublicStyleOverrideDocument,
} from "@/lib/public-style-overrides";

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
    <div data-public-style-version={document.version}>
      {css ? <style>{css}</style> : null}
      {children}
    </div>
  );
}