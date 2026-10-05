import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PublicLink } from "@/components/public-nav-context";
import { PublicStyleTarget } from "@/components/public-style-target";
import { usePublicStyleDocument, usePublicStyleEnabled } from "@/components/public-style-scope";
import { publicBackLinkLabel, type PublicBackLinkContext } from "@/lib/public-style-overrides";

/**
 * Every public "Back / Back to …" link. V1 renders the exact legacy element;
 * V2 uses one shared registered style (`shared.backLink`) with a per-context
 * record override and an optional event-scoped label. The destination is
 * fixed by the caller and never configurable.
 */
export function PublicBackLink({
  context,
  to,
  label,
  legacy,
  legacyClassName,
  legacyStyle,
  legacyArrow = true,
  v2ClassName = "inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.22em] underline-offset-4 hover:underline focus-visible:underline",
}: {
  context: PublicBackLinkContext;
  to: string;
  /** Original copy without the arrow. */
  label: string;
  /** Legacy element kind for V1: router Link, PublicLink, or plain anchor. */
  legacy: "link" | "public" | "anchor";
  legacyClassName: string;
  legacyStyle?: CSSProperties;
  legacyArrow?: boolean;
  v2ClassName?: string;
}) {
  const v2 = usePublicStyleEnabled();
  const document = usePublicStyleDocument();
  if (!v2) {
    const text = legacyArrow ? `← ${label}` : label;
    if (legacy === "anchor") return <a href={to} className={legacyClassName} style={legacyStyle}>{text}</a>;
    if (legacy === "public") return <PublicLink to={to} className={legacyClassName} style={legacyStyle}>{text}</PublicLink>;
    return <Link to={to as never} className={legacyClassName} style={legacyStyle}>{text}</Link>;
  }
  const text = publicBackLinkLabel(document, context, label);
  return (
    <PublicStyleTarget id="shared.backLink" recordId={context}>
      <PublicLink
        to={to}
        className={v2ClassName}
        style={{ color: "var(--event-link, var(--event-primary, #1F3D2B))" }}
        data-back-link={context}
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--item-icon-color, currentColor)" }} aria-hidden />
        <span>{text}</span>
      </PublicLink>
    </PublicStyleTarget>
  );
}
