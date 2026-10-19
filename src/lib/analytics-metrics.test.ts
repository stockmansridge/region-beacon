import { describe, expect, it } from "vitest";
import { analyticsDateRange, awardQualified, bonusItemTotals, countPassportsWithVenueVisits, describePagePath, venueCheckinDays, venueEngagement } from "./analytics-metrics";

describe("analytics filters and metrics", () => {
  const stamps = new Map([0, 1, 2, 3, 4, 5, 6].map(n => [String(n), new Set(Array.from({ length: n }, (_, i) => `venue-${i}`))]));
  for (const [minimum, expected] of [[3, 4], [4, 3], [5, 2]]) {
    it(`counts passports with ${minimum}+ distinct venues inclusively`, () => {
      expect(countPassportsWithVenueVisits(stamps, minimum)).toBe(expected);
      expect(countPassportsWithVenueVisits(new Map(), minimum)).toBe(0);
    });
  }
  it("graphs only the selected venue within the range and includes zero-check-in days", () => {
    expect(venueCheckinDays([
      { venue_id: "a", created_at: "2026-10-01T01:00:00Z" },
      { venue_id: "a", created_at: "2026-10-01T02:00:00Z" },
      { venue_id: "a", created_at: "2026-10-03T01:00:00Z" },
      { venue_id: "a", created_at: "2026-09-30T01:00:00Z" },
      { venue_id: "b", created_at: "2026-10-02T01:00:00Z" },
    ], "a", new Date("2026-10-01T00:00:00Z"), new Date("2026-10-03T23:59:59Z"))).toEqual([["2026-10-01", 2], ["2026-10-02", 0], ["2026-10-03", 1]]);
  });
  it("totals bonus scans and awarded points separately without merging events", () => {
    const rows = bonusItemTotals([
      { event_id: "a", source_id: "code", points_awarded: 5, metadata: null },
      { event_id: "a", source_id: "code", points_awarded: 10, metadata: null },
      { event_id: "b", source_id: "code", points_awarded: 7, metadata: null },
      { event_id: "a", source_id: null, points_awarded: 0, metadata: { bonus_code_name: "Deleted code" } },
    ], new Map([["code", "Bonus item"]]));
    expect(rows.map(r => [r.event_id, r.name, r.scans, r.points])).toEqual([
      ["a", "Bonus item", 2, 15], ["b", "Bonus item", 1, 7], ["a", "Deleted code", 1, 0],
    ]);
  });
  for (const days of [1, 14] as const) it(`includes the last ${days} days`, () => {
    const now = new Date("2026-10-17T08:30:00Z");
    const range = analyticsDateRange(`${days}d`, now);
    expect(range.from?.getTime()).toBe(now.getTime() - days * 86400000);
    expect(range.to).toEqual(now);
  });
  it("includes the entire custom end day", () => {
    const range = analyticsDateRange("custom", new Date(), { from: new Date(2026, 9, 1), to: new Date(2026, 9, 3) });
    expect(range.from?.getHours()).toBe(0);
    expect(range.to?.getHours()).toBe(23);
    expect(range.to?.getMilliseconds()).toBe(999);
  });
  it("retains zero venues and counts only venue-attributed bonus scans", () => {
    const rows = venueEngagement([{ id: "a", name: "A", event_id: "e" }, { id: "b", name: "B", event_id: "e" }], [{ venue_id: "a", passport_id: "p", created_at: "2026-10-01" }], [{ source_id: "code", participant_id: "p", created_at: "2026-10-02", metadata: null }, { source_id: null, participant_id: "q", created_at: "2026-10-02", metadata: null }], [{ id: "code", venue_id: "a" }]);
    expect(rows.map(r => [r.venue_id, r.count, r.bonus, r.unique])).toEqual([["a", 1, 1, 1], ["b", 0, 0, 0]]);
  });
  it("ranks venues by check-ins and shares check-ins over all check-ins, not by bonus scans or unique visitors", () => {
    const checkins = [
      ...Array.from({ length: 5 }, (_, i) => ({ venue_id: "a", passport_id: `p${i}`, created_at: "2026-10-01" })),
      ...Array.from({ length: 3 }, (_, i) => ({ venue_id: "b", passport_id: `q${i}`, created_at: "2026-10-01" })),
    ];
    // Venue b has more bonus scans and the same unique visitor count, so an
    // ordering by scans or unique visitors would place it first.
    const bonus = Array.from({ length: 4 }, () => ({ source_id: "code", participant_id: "r", created_at: "2026-10-02", metadata: null }));
    const rows = venueEngagement([{ id: "a", name: "A", event_id: "e" }, { id: "b", name: "B", event_id: "e" }], checkins, bonus, [{ id: "code", venue_id: "b" }]);
    expect(rows.map(r => [r.venue_id, r.count, r.scans, Number(r.pct.toFixed(1))])).toEqual([["a", 5, 5, 62.5], ["b", 3, 7, 37.5]]);
  });
  it("includes bonus-only points for current prize qualification", () => {
    expect(awardQualified(10, 0, 2, { points_required: 10, requires_all_locations: false })).toBe(true);
    expect(awardQualified(9, 0, 2, { points_required: 10, requires_all_locations: false })).toBe(false);
  });
  it("all-location awards require active venues and visits", () => {
    const award = { points_required: 10, requires_all_locations: true };
    expect(awardQualified(10, 2, 2, award)).toBe(true);
    expect(awardQualified(10, 1, 2, award)).toBe(false);
    expect(awardQualified(10, 0, 0, award)).toBe(false);
  });
  it("resolves venue UUIDs in Pages stats paths to venue names", () => {
    const names = new Map([["baf06f6e-7de8-4110-b6ea-c6c90091d09b", "Stockmans Ridge"]]);
    expect(describePagePath("/venues/baf06f6e-7de8-4110-b6ea-c6c90091d09b", names)).toBe("Stockmans Ridge — venue details");
    // Uppercase UUIDs in URLs still resolve; unknown venues keep the raw path.
    expect(describePagePath("/venues/BAF06F6E-7DE8-4110-B6EA-C6C90091D09B", names)).toBe("Stockmans Ridge — venue details");
    expect(describePagePath("/venues/00000000-0000-0000-0000-000000000000", names)).toBe("/venues/00000000-0000-0000-0000-000000000000");
    expect(describePagePath("/join", names)).toBe("/join");
  });
});
