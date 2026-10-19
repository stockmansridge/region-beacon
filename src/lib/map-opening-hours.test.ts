import { describe, expect, it } from "vitest";
import { mapVenueIsOpen, type PublicMapHours } from "./map-opening-hours";

const now = new Date("2026-10-19T01:00:00Z");
const hours: PublicMapHours = { hours_source: "google", synced_at: "2026-10-18T00:00:00Z", utc_offset_minutes: 600, periods: [{ open: { day: 1, hour: 10 }, close: { day: 1, hour: 17 } }] };
describe("Map Open now", () => {
  it("includes a positively open venue using the event timezone", () => {
    expect(mapVenueIsOpen(hours, now, "Australia/Sydney")).toBe(true);
    expect(mapVenueIsOpen(hours, new Date("2026-10-19T06:30:00Z"), "Australia/Sydney")).toBe(false);
  });
  it("excludes unknown and manual free-text hours", () => {
    expect(mapVenueIsOpen(undefined, now, "Australia/Sydney")).toBe(false);
    expect(mapVenueIsOpen({ ...hours, hours_source: "manual" }, now, "Australia/Sydney")).toBe(false);
    expect(mapVenueIsOpen({ ...hours, periods: null }, now, "Australia/Sydney")).toBe(false);
  });
  it("excludes cached Google hours at or beyond 28 days, or without a valid sync time", () => {
    expect(mapVenueIsOpen({ ...hours, synced_at: "2026-09-21T01:00:00Z" }, now, "Australia/Sydney")).toBe(false);
    expect(mapVenueIsOpen({ ...hours, synced_at: null }, now, "Australia/Sydney")).toBe(false);
    expect(mapVenueIsOpen({ ...hours, synced_at: "invalid" }, now, "Australia/Sydney")).toBe(false);
  });
  it("includes overnight hours across the venue-local week boundary", () => {
    expect(mapVenueIsOpen({ ...hours, synced_at: "2026-10-17T00:00:00Z", periods: [{ open: { day: 6, hour: 20 }, close: { day: 0, hour: 2 } }] }, new Date("2026-10-17T14:00:00Z"), "Australia/Sydney")).toBe(true);
  });
});