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
  const replacesBackgroundImage = Boolean(target.style.backgroundColor) && !target.style.backgroundImage;
  const childStyle = { ...children.props.style };
  if (replacesBackgroundImage) {
    delete childStyle.background;
    delete childStyle.backgroundImage;
  }
  return cloneElement(children, {
    ...target,
    style: {
      ...childStyle,
      ...target.style,
      ...(replacesBackgroundImage ? { backgroundImage: "none" } : {}),
    },
  });
}