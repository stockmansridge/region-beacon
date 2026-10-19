import { describe, expect, it } from "vitest";
import { resolveScannedQr } from "./scanned-qr";

const current = "https://orangewinequest.getstampd.com.au/scan";

describe("mobile QR destinations", () => {
  it("opens bonus codes in the existing claim flow", () => {
    expect(resolveScannedQr("https://orangewinequest.getstampd.com.au/collect/bonus/bonus_123", current))
      .toEqual({ kind: "internal", href: "/collect/bonus/bonus_123" });
  });
  it("keeps venue check-in routes", () => {
    expect(resolveScannedQr("/checkin/venue-123", current)).toEqual({ kind: "internal", href: "/checkin/venue-123" });
  });
  it("supports tasting codes", () => {
    expect(resolveScannedQr("/tasting/taste_123", current)).toEqual({ kind: "internal", href: "/tasting/taste_123" });
  });
  it("supports relative bonus links and retains query/hash", () => {
    expect(resolveScannedQr(" /collect/bonus/b123?source=poster#result ", current))
      .toEqual({ kind: "internal", href: "/collect/bonus/b123?source=poster#result" });
  });
  it("accepts the same event on the alternate brand root", () => {
    expect(resolveScannedQr("https://orangewinequest.getstampd.com/collect/bonus/b123", current))
      .toEqual({ kind: "internal", href: "/collect/bonus/b123" });
  });
  it("does not silently claim another event's bonus", () => {
    const href = "https://other.getstampd.com.au/collect/bonus/b123";
    expect(resolveScannedQr(href, current)).toEqual({ kind: "link", href });
  });
  it("reads non-venue website QR codes", () => {
    const href = "https://example.org/offers";
    expect(resolveScannedQr(href, current)).toEqual({ kind: "link", href });
  });
  it("reads arbitrary QR text without executing it", () => {
    expect(resolveScannedQr("BONUS POINTS 2026", current)).toEqual({ kind: "text", text: "BONUS POINTS 2026" });
  });
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "https://user:pass@example.org", ""])("never opens unsafe payload %s", (raw) => {
    expect(resolveScannedQr(raw, current)).toEqual({ kind: "blocked" });
  });
  it("does not mistake a longer path for a venue token", () => {
    expect(resolveScannedQr("/checkin/abc/extra", current).kind).toBe("link");
  });
});