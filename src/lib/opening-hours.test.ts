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
  it("splits Google weekday lines", () => {
    expect(splitWeekdayLine("Monday: 10:00 AM – 5:00 PM", "Monday")).toEqual({ day: "Monday", hours: "10:00 AM – 5:00 PM" });
    expect(splitWeekdayLine("Closed", "Tuesday")).toEqual({ day: "Tuesday", hours: "Closed" });
  });
});
