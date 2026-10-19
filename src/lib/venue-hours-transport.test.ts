import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setServerEnvBindings } from "./server-env.server";
import { HaltSync, syncVenueHours, type DueVenue } from "./venue-hours.server";

const venue: DueVenue = {
  venue_id: "baf06f6e-7de8-4110-b6ea-c6c90091d09b", agency_id: "agency", event_id: "event",
  name: "Stockmans Ridge Wines", lat: -33.35, lng: 149.05,
  address: "21 Boree Lane, Lidster NSW 2800", google_place_id: null,
};
const hours = { periods: [{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }], weekdayDescriptions: ["Monday: 9 AM – 5 PM"] };
const existing = { google_place_id: "previous", google_place_name: venue.name, google_hours: hours,
  utc_offset_minutes: 660, hours_source: "manual", synced_at: "2026-10-10T00:00:00Z" };
function database() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }), upsert };
  const from = vi.fn().mockReturnValue(query);
  return { client: { from } as unknown as SupabaseClient, upsert, from };
}
function configure(target: "cloudflare" | "lovable") {
  vi.stubEnv("VITE_DEPLOY_TARGET", target);
  // Synthetic test fixtures only; these are not real credentials.
  setServerEnvBindings(target === "cloudflare" ? { GOOGLE_PLACES_API_KEY: "test-places-key" }
    : { LOVABLE_API_KEY: "test-lovable-key", GOOGLE_MAPS_API_KEY_1: "test-connector-key" });
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
afterEach(() => { setServerEnvBindings({}); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each(["cloudflare", "lovable"] as const)("%s opening-hours transport", (target) => {
  it("refreshes through the correct endpoint and headers, retaining matching masks and preferences", async () => {
    configure(target);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ places: [{ id: "matched", displayName: { text: venue.name }, location: { latitude: venue.lat, longitude: venue.lng } }] }))
      .mockResolvedValueOnce(json({ displayName: { text: venue.name }, regularOpeningHours: hours, utcOffsetMinutes: 660 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = database();
    expect(await syncVenueHours(db.client, venue)).toBe("ok");
    const base = target === "cloudflare" ? "https://places.googleapis.com/v1" : "https://connector-gateway.lovable.dev/google_maps/places/v1";
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${base}/places:searchText`);
    expect(request.method).toBe("POST");
    const headers = new Headers(request.headers);
    expect(headers.get("X-Goog-FieldMask")).toBe("places.id,places.displayName,places.formattedAddress,places.location");
    if (target === "cloudflare") {
      expect(headers.get("X-Goog-Api-Key")).toBe("test-places-key");
      expect(headers.has("Authorization")).toBe(false);
      expect(headers.has("X-Connection-Api-Key")).toBe(false);
    } else {
      expect(headers.get("Authorization")).toBe("Bearer test-lovable-key");
      expect(headers.get("X-Connection-Api-Key")).toBe("test-connector-key");
      expect(headers.has("X-Goog-Api-Key")).toBe(false);
    }
    expect(JSON.parse(request.body)).toMatchObject({ textQuery: venue.name, pageSize: 5 });
    expect(fetchMock.mock.calls[1][0]).toBe(`${base}/places/matched`);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Goog-FieldMask")).toBe("displayName,formattedAddress,regularOpeningHours,utcOffsetMinutes");
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ venue_id: venue.venue_id, agency_id: venue.agency_id,
      event_id: venue.event_id, google_place_id: "matched", google_hours: hours, sync_status: "ok" }));
    expect(db.upsert.mock.calls[0][0]).not.toHaveProperty("hours_source");
    expect(db.upsert.mock.calls[0][0]).not.toHaveProperty("manual_hours");
  });

  it("preserves confirmed data and timestamp when no match exists", async () => {
    configure(target);
    const fetchMock = vi.fn().mockResolvedValue(json({ places: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const db = database();
    expect(await syncVenueHours(db.client, venue)).toBe("not_found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ google_hours: hours,
      google_place_id: existing.google_place_id, synced_at: existing.synced_at, sync_status: "not_found" }));
  });

  it.each([401, 402, 403, 429])("halts on HTTP %s without retries, clearing data or advancing timestamps", async (status) => {
    configure(target);
    const fetchMock = vi.fn().mockResolvedValue(json({ error: { message: "request refused" } }, status));
    vi.stubGlobal("fetch", fetchMock);
    const db = database();
    await expect(syncVenueHours(db.client, venue)).rejects.toBeInstanceOf(HaltSync);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("recognises Google's HTTP 400 invalid-key response and redacts echoed credentials", async () => {
    configure(target);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "API_KEY_INVALID test-places-key test-connector-key" } }, 400)));
    const db = database();
    const failure = await syncVenueHours(db.client, venue).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HaltSync);
    expect(String(failure)).toContain("[400]");
    expect(String(failure)).not.toContain(target === "cloudflare" ? "test-places-key" : "test-connector-key");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("keeps last-known-good data on a transient provider failure", async () => {
    configure(target);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "unavailable" } }, 503)));
    const db = database();
    expect(await syncVenueHours(db.client, venue)).toBe("error");
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ google_hours: hours,
      google_place_id: existing.google_place_id, synced_at: existing.synced_at, sync_status: "error" }));
  });
});

it("Cloudflare resolves the request binding rather than requiring process.env or Lovable credentials", async () => {
  configure("cloudflare");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  const fetchMock = vi.fn().mockResolvedValue(json({ places: [] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await syncVenueHours(database().client, venue)).toBe("not_found");
  expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Goog-Api-Key")).toBe("test-places-key");
});

it("missing Cloudflare key fails closed even if connector credentials exist", async () => {
  configure("cloudflare");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  setServerEnvBindings({ LOVABLE_API_KEY: "test-lovable-key", GOOGLE_MAPS_API_KEY: "test-connector-key" });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const db = database();
  await expect(syncVenueHours(db.client, venue)).rejects.toThrow("GOOGLE_PLACES_API_KEY");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(db.from).not.toHaveBeenCalled();
});

it("Lovable still requires its connector credentials and never falls back to the direct key", async () => {
  configure("lovable");
  vi.stubEnv("LOVABLE_API_KEY", ""); vi.stubEnv("GOOGLE_MAPS_API_KEY", ""); vi.stubEnv("GOOGLE_MAPS_API_KEY_1", "");
  setServerEnvBindings({ GOOGLE_PLACES_API_KEY: "test-places-key" });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(syncVenueHours(database().client, venue)).rejects.toThrow("not configured");
  expect(fetchMock).not.toHaveBeenCalled();
});