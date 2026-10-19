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
    expect(hit).toMatchObject({ kind: "match", id: "a" });
  });
  it("rejects a nearby business with a different name", () => {
    expect(choosePlace(V, [{ id: "a", name: "Ridge View Hotel", ...near }])).toEqual({ kind: "none" });
  });
  it("rejects a same-name listing that is too far away", () => {
    expect(choosePlace(V, [{ id: "a", name: "Stockmans Ridge Wines", ...far }])).toEqual({ kind: "none" });
  });
  it("holds two same-name listings close together as ambiguous", () => {
    const hit = choosePlace(V, [
      { id: "dup-a", name: "Stockman's Ridge Wines", lat: -33.3501, lng: 149.0501 },
      { id: "dup-b", name: "Stockman's Ridge Wines", lat: -33.3502, lng: 149.0502 }, // ~28 m away
    ]);
    expect(hit.kind).toBe("ambiguous");
    if (hit.kind === "ambiguous") expect(hit.candidates).toHaveLength(2);
  });
  it("still picks a clearly dominant match when the rival is much further", () => {
    const hit = choosePlace(V, [
      { id: "near-dup", name: "Stockman's Ridge Wines", ...near },
      { id: "far-dup", name: "Stockman's Ridge Wines", lat: -33.3515, lng: 149.0515 }, // ~210 m away, outside gap
    ]);
    expect(hit).toMatchObject({ kind: "match", id: "near-dup" });
  });
  it("uses address locality evidence to resolve close duplicates", () => {
    const venue = { ...V, address: "21 Boree Lane, Lidster NSW 2800" };
    const hit = choosePlace(venue, [
      { id: "right", name: "Stockman's Ridge Wines", address: "21 Boree Ln, Lidster NSW 2800", lat: -33.3501, lng: 149.0501 },
      { id: "wrong", name: "Stockman's Ridge Wines", address: "5 Main St, Orange NSW 2800", lat: -33.3502, lng: 149.0502 },
    ]);
    expect(hit).toMatchObject({ kind: "match", id: "right" });
  });
  it("stays ambiguous when both duplicates share the same locality", () => {
    const venue = { ...V, address: "21 Boree Lane, Lidster NSW 2800" };
    const hit = choosePlace(venue, [
      { id: "a", name: "Stockman's Ridge Wines", address: "21 Boree Ln, Lidster NSW 2800", lat: -33.3501, lng: 149.0501 },
      { id: "b", name: "Stockman's Ridge Wines", address: "19 Boree Ln, Lidster NSW 2800", lat: -33.3502, lng: 149.0502 },
    ]);
    expect(hit.kind).toBe("ambiguous");
  });
  it("stays ambiguous when duplicates share only a street name, not a locality", () => {
    const venue = { ...V, address: "21 Boree Lane, Lidster NSW 2800" };
    const hit = choosePlace(venue, [
      { id: "a", name: "Stockman's Ridge Wines", address: "21 Boree Ln, Lidster NSW 2800", lat: -33.3501, lng: 149.0501 },
      { id: "b", name: "Stockman's Ridge Wines", address: "8 Boree Ln, Canobolas NSW 2800", lat: -33.3502, lng: 149.0502 },
    ]);
    // "Boree" is a shared street-name word and must not resolve the duplicate.
    expect(hit.kind).toBe("ambiguous");
  });
  it("ignores candidates without a position", () => {
    expect(choosePlace(V, [{ id: "a", name: "Stockmans Ridge Wines" }])).toEqual({ kind: "none" });
  });
  it("returns none for a venue with an invalid position", () => {
    expect(
      choosePlace({ name: V.name, lat: NaN, lng: 149.05 }, [{ id: "a", name: "Stockmans Ridge Wines", ...near }]),
    ).toEqual({ kind: "none" });
  });
  it("enforces the 200 m radius boundary", () => {
    const at190 = { id: "in", name: "Stockmans Ridge Wines", lat: V.lat + 0.0017, lng: V.lng }; // ~189 m
    const at260 = { id: "out", name: "Stockmans Ridge Wines", lat: V.lat + 0.0024, lng: V.lng }; // ~267 m
    expect(choosePlace(V, [at190])).toMatchObject({ kind: "match", id: "in" });
    expect(choosePlace(V, [at260])).toEqual({ kind: "none" });
    expect(MATCH_RADIUS_M).toBe(200);
  });
});
