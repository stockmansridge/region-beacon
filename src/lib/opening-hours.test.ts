import { describe, expect, it } from "vitest";
import { isOpenNow, todayIndexMonFirst, splitWeekdayLine } from "./opening-hours";

const SYD = 660; // UTC+11
// Mon–Fri 10:00–17:00
const weekdays = [1, 2, 3, 4, 5].map((d) => ({ open: { day: d, hour: 10 }, close: { day: d, hour: 17 } }));

describe("opening hours", () => {
  it("is open on Monday 12:00 Sydney time", () => {
    // Mon 19 Oct 2026 12:00 AEDT = 01:00 UTC
    expect(isOpenNow(weekdays, SYD, new Date("2026-10-19T01:00:00Z"))).toBe(true);
  });
  it("is closed on Monday 18:00 Sydney time", () => {
    expect(isOpenNow(weekdays, SYD, new Date("2026-10-19T07:00:00Z"))).toBe(false);
  });
  it("is closed on Sunday", () => {
    expect(isOpenNow(weekdays, SYD, new Date("2026-10-18T01:00:00Z"))).toBe(false);
  });
  it("handles a Saturday-night period running past midnight", () => {
    const late = [{ open: { day: 6, hour: 20 }, close: { day: 0, hour: 2 } }];
    // Sun 01:00 AEDT = Sat 14:00 UTC
    expect(isOpenNow(late, SYD, new Date("2026-10-17T14:00:00Z"))).toBe(true);
  });
  it("treats a single never-closing period as open 24/7", () => {
    expect(isOpenNow([{ open: { day: 0, hour: 0 } }], SYD, new Date())).toBe(true);
  });
  it("returns unknown without periods or offset", () => {
    expect(isOpenNow([], SYD)).toBeNull();
    expect(isOpenNow(weekdays, null)).toBeNull();
  });
  it("uses the venue's local day for today", () => {
    // Sun 18 Oct 14:00 UTC is already Monday 01:00 in Sydney
    expect(todayIndexMonFirst(SYD, new Date("2026-10-18T14:00:00Z"))).toBe(0);
  });
  it("follows the DST offset Google reports, not a fixed one", () => {
    // Same UTC instant, Mon 06:30 UTC: 17:30 in summer (AEDT, +660) is closed,
    // 16:30 in winter (AEST, +600) is still open.
    const t = new Date("2026-10-19T06:30:00Z");
    expect(isOpenNow(weekdays, 660, t)).toBe(false);
    expect(isOpenNow(weekdays, 600, t)).toBe(true);
  });
  it("uses the IANA timezone across DST, not Google's last recorded offset", () => {
    // Stored offset is stale winter AEST (+600). On Mon 19 Oct 2026 06:30 UTC
    // Sydney is in AEDT summer time (17:30) — closed, even though the stale
    // offset alone would say 16:30 and open.
    const t = new Date("2026-10-19T06:30:00Z");
    expect(isOpenNow(weekdays, 600, t, "Australia/Sydney")).toBe(false);
    // A winter instant with a stale summer offset: 06:30 UTC in July is
    // 16:30 AEST — open, though the stale +660 offset would say 17:30 closed.
    const winter = new Date("2026-07-20T06:30:00Z");
    expect(isOpenNow(weekdays, 660, winter, "Australia/Sydney")).toBe(true);
  });
  it("is independent of the viewer's own timezone", () => {
    // Same UTC instant viewed from anywhere: venue-local time decides.
    const t = new Date("2026-10-19T01:00:00Z"); // Mon 12:00 in Sydney
    expect(isOpenNow(weekdays, null, t, "Australia/Sydney")).toBe(true);
    expect(isOpenNow(weekdays, null, t, "Australia/Perth")).toBe(false); // 09:00 in Perth
  });
  it("uses the venue-local day for today across the DST boundary", () => {
    // Sun 4 Oct 2026 15:30 UTC = Mon 5 Oct 02:30 AEDT (clocks sprang forward 02:00→03:00)
    expect(todayIndexMonFirst(600, new Date("2026-10-04T15:30:00Z"), "Australia/Sydney")).toBe(0);
  });
  it("falls back to the stored offset when the timezone is missing or invalid", () => {
    const t = new Date("2026-10-19T01:00:00Z");
    expect(isOpenNow(weekdays, SYD, t, null)).toBe(true);
    expect(isOpenNow(weekdays, SYD, t, "Not/AZone")).toBe(true);
  });
  it("splits Google weekday lines", () => {
    expect(splitWeekdayLine("Monday: 10:00 AM – 5:00 PM", "Monday")).toEqual({ day: "Monday", hours: "10:00 AM – 5:00 PM" });
    expect(splitWeekdayLine("Closed", "Tuesday")).toEqual({ day: "Tuesday", hours: "Closed" });
  });
});
