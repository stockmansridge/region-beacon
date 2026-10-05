// Render plain-text legal body with `## ` headings and blank-line paragraph
// breaks. Admins enter plain text only — never raw HTML — so this component
// does NOT use dangerouslySetInnerHTML.
import React from "react";
import { PublicStyleTarget } from "@/components/public-style-target";
import { usePublicStyleEnabled } from "@/components/public-style-scope";

export function LegalBody({ body, section }: { body: string; section?: "terms" | "privacy" }) {
  const v2 = usePublicStyleEnabled() && Boolean(section);
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const content = blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("## ")) {
      const heading = (
        <h2
          key={i}
          className={v2 ? "font-trail-serif text-xl font-semibold" : "font-trail-serif text-xl font-semibold text-[#1F3D2B]"}
          style={v2 ? { color: "var(--event-page-heading, var(--event-primary, #1F3D2B))" } : undefined}
        >
          {trimmed.slice(3).trim()}
        </h2>
      );
      return v2 ? <PublicStyleTarget key={i} id="legal.document.heading" recordId={section}>{heading}</PublicStyleTarget> : heading;
    }
    // Preserve single newlines within a paragraph as <br/>. In V2 paragraphs
    // carry no type/colour classes so the document-text control is inherited.
    return (
      <p key={i} className="whitespace-pre-line">
        {trimmed.split("\n").join("\n")}
      </p>
    );
  });
  if (!v2) {
    return <div className="space-y-4 text-[15px] leading-relaxed text-[#3D372C]">{content}</div>;
  }
  return (
    <PublicStyleTarget id="legal.document.body" recordId={section}>
      <div
        className="space-y-4 text-[15px] leading-relaxed"
        style={{ color: "var(--event-body, #3D372C)" }}
        data-legal-section={section}
      >
        {content}
      </div>
    </PublicStyleTarget>
  );
}
