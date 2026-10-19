import { describe, expect, it } from "vitest";
import { choosePlace, namesMatch, normalizeVenueName, MATCH_RADIUS_M } from "./venue-hours-match";

const V = { name: "Stockman's Ridge Wines", lat: -33.35, lng: 149.05 };
const near = { lat: -33.3501, lng: 149.0501 }; // ~14 m away
const far = { lat: -33.36, lng: 149.06 }; // ~1.4 km away

describe("normalizeVenueName", () => {
  it("strips case, punctuation and diacritics", () => {
    expect(normalizeVenueName("Stockman's Ridge Wines")).toBe("stockmans ridge wines");
    expect(normalizeVenueName("Café  René!")).toBe("cafe rene");
    expect(normalizeVenueName("Fish & Chips")).toBe("fish and chips");
  });
});

describe("namesMatch", () => {
  it("matches with punctuation/case differences", () => {
    expect(namesMatch("Stockman's Ridge Wines", "Stockmans Ridge Wines")).toBe(true);
    expect(namesMatch("Café René", "Cafe Rene")).toBe(true);
  });
  it("matches when one name extends the other", () => {
    expect(namesMatch("Stockman's Ridge", "Stockman's Ridge Wines")).toBe(true);
    expect(namesMatch("The Old Mill Café", "Old Mill Cafe")).toBe(true);
  });
  it("rejects different businesses", () => {
    expect(namesMatch("Stockman's Ridge Wines", "Ridge View Hotel")).toBe(false);
    expect(namesMatch("Stockman's Ridge Wines", "Stockman's Bakery")).toBe(false);
    expect(namesMatch("Stockman's Ridge Wines", null)).toBe(false);
  });
});

describe("choosePlace", () => {
  it("picks the name-matching candidate within range", () => {
    const hit = choosePlace(V, [
      { id: "a", name: "Stockmans Ridge Wines", ...near },
      { id: "b", name: "Stockmans Ridge Wines", ...far },
    ]);
    expect(hit?.id).toBe("a");
  });
  it("rejects a nearby business with a different name", () => {
    expect(choosePlace(V, [{ id: "a", name: "Ridge View Hotel", ...near }])).toBeNull();
  });
  it("rejects a same-name listing that is too far away", () => {
    expect(choosePlace(V, [{ id: "a", name: "Stockmans Ridge Wines", ...far }])).toBeNull();
  });
  it("chooses the nearest of two same-name duplicates", () => {
    const hit = choosePlace(V, [
      { id: "far-dup", name: "Stockman's Ridge Wines", lat: -33.351, lng: 149.051 },
      { id: "near-dup", name: "Stockman's Ridge Wines", ...near },
    ]);
    expect(hit?.id).toBe("near-dup");
  });
  it("ignores candidates without a position", () => {
    expect(choosePlace(V, [{ id: "a", name: "Stockmans Ridge Wines" }])).toBeNull();
  });
  it("returns null for a venue with an invalid position", () => {
    expect(
      choosePlace({ name: V.name, lat: NaN, lng: 149.05 }, [{ id: "a", name: "Stockmans Ridge Wines", ...near }]),
    ).toBeNull();
  });
  it("enforces the 200 m radius boundary", () => {
    const at190 = { id: "in", name: "Stockmans Ridge Wines", lat: V.lat + 0.0017, lng: V.lng }; // ~189 m
    const at260 = { id: "out", name: "Stockmans Ridge Wines", lat: V.lat + 0.0024, lng: V.lng }; // ~267 m
    expect(choosePlace(V, [at190])?.id).toBe("in");
    expect(choosePlace(V, [at260])).toBeNull();
    expect(MATCH_RADIUS_M).toBe(200);
  });
});
