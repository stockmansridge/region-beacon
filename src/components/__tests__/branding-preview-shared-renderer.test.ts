import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: the embedded Branding preview, the draft admin full
 * preview and the public subdomain route must all render the SAME landing
 * implementation (EventPublicLanding). Duplicated landing JSX inside the
 * editor is what caused organisers to brand against a fake preview.
 */
const SURFACES = [
  "src/routes/live.$subdomain.index.tsx",
  "src/routes/admin_.events.$eventId.preview.tsx",
  "src/routes/admin.events.$eventId_.branding.tsx",
];

describe("public landing shared renderer", () => {
  for (const file of SURFACES) {
    it(`${file} renders EventPublicLanding`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/from "@\/components\/event-public-landing"/);
      expect(src).toContain("<EventPublicLanding");
    });
  }

  it("the branding editor does not re-implement the landing page", () => {
    const src = readFileSync("src/routes/admin.events.$eventId_.branding.tsx", "utf8");
    expect(src).not.toContain("<TrailLanding");
  });

  it("welcome copy uses the card body role, not the hero text role", () => {
    const src = readFileSync("src/components/event-public-landing.tsx", "utf8");
    const marker = 'data-brand-hint="card_body_color"';
    expect(src).toContain(marker);
    const block = src.slice(src.indexOf(marker), src.indexOf(marker) + 600);
    expect(block).toContain("var(--event-card-text");
    expect(block).not.toContain("--event-hero-fg");
  });
});
