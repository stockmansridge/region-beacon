// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportPosterNodesToPdf } from "./poster-export";

const pdf = vi.hoisted(() => ({
  addImage: vi.fn(), addPage: vi.fn(), save: vi.fn(),
}));
vi.mock("jspdf", () => ({ jsPDF: vi.fn(function () { return pdf; }) }));
vi.mock("html-to-image", () => ({
  toPng: vi.fn(async () => "data:image/png;base64,sample"),
  toJpeg: vi.fn(async () => "data:image/jpeg;base64,sample"),
  getFontEmbedCSS: vi.fn(async () => ""),
}));

describe("bulk poster print-safe edge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("insets every page at least 5 mm on A4 without distorting or cropping artwork", async () => {
    await exportPosterNodesToPdf(
      [document.createElement("div"), document.createElement("div")],
      "posters.pdf", { printSafeBorder: true },
    );
    expect(pdf.addImage).toHaveBeenCalledTimes(2);
    for (const call of pdf.addImage.mock.calls) {
      const [, , x, y, width, height] = call;
      expect(x).toBe(5);
      expect(width).toBe(200);
      expect(y).toBeGreaterThanOrEqual(5);
      expect(297 - y - height).toBeGreaterThanOrEqual(5);
      expect(210 - x - width).toBe(5);
      expect(width / height).toBeCloseTo(210 / 297, 10);
    }
    expect(pdf.addPage).toHaveBeenCalledWith("a4", "portrait");
    expect(pdf.save).toHaveBeenCalledWith("posters.pdf");
  });

  it("keeps the standard download full-size when the option is off", async () => {
    await exportPosterNodesToPdf([document.createElement("div")], "standard.pdf");
    expect(pdf.addImage).toHaveBeenCalledWith(
      "data:image/jpeg;base64,sample", "JPEG", 0, 0, 210, 297, undefined, "FAST",
    );
  });
});