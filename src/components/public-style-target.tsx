import { cloneElement, type CSSProperties, type ReactElement } from "react";
import { usePublicStyleTarget } from "@/components/public-style-scope";
import type { PublicStyleElementId } from "@/lib/public-style-overrides";

/** Applies a V2 semantic target to the actual rendered element without adding layout markup. */
export function PublicStyleTarget({
  id,
  recordId,
  children,
}: {
  id: PublicStyleElementId;
  recordId?: string | null;
  children: ReactElement<{ style?: CSSProperties }>;
}) {
  const target = usePublicStyleTarget(id, { recordId, selectable: true });
  return cloneElement(children, {
    ...target,
    style: { ...children.props.style, ...target.style },
  });
}