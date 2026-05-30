// Render plain-text legal body with `## ` headings and blank-line paragraph
// breaks. Admins enter plain text only — never raw HTML — so this component
// does NOT use dangerouslySetInnerHTML.
import React from "react";

export function LegalBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-[#3D372C]">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="font-trail-serif text-xl font-semibold text-[#1F3D2B]"
            >
              {trimmed.slice(3).trim()}
            </h2>
          );
        }
        // Preserve single newlines within a paragraph as <br/>
        const lines = trimmed.split("\n");
        return (
          <p key={i} className="whitespace-pre-line">
            {lines.join("\n")}
          </p>
        );
      })}
    </div>
  );
}
