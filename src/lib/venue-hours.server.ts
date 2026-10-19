// Server-only: fetch venue opening hours from Google Places (New) via the
// Lovable connector gateway and store them. Never called on page views.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readServerEnv } from "@/lib/server-env.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const MATCH_RADIUS_M = 200;

export type DueVenue = {
  venue_id: string;
  agency_id: string;
  event_id: string;
  name: string;
  lat: number;
  lng: number;
  google_place_id: string | null;
};

/** Stops the whole run (key/quota problems) instead of failing one venue. */
export class HaltSync extends Error {}

function creds() {
  const lovable = readServerEnv("LOVABLE_API_KEY");
  const maps = readServerEnv("GOOGLE_MAPS_API_KEY");
  if (!lovable || !maps) throw new HaltSync("Google Maps connection is not configured on this server.");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps };
}

async function check(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  const body = await res.text();
  if (res.status === 403) {
    if (body.includes("API_KEY_HTTP_REFERRER_BLOCKED"))
      throw new HaltSync('Google Maps server key is referrer-restricted. Set its application restrictions to "None" or "IP addresses".');
    if (body.includes("API_KEY_SERVICE_BLOCKED"))
      throw new HaltSync("Google Maps server key does not allow Places API (New). Add it to the key's allowed APIs.");
    throw new HaltSync(`Google Maps denied the request (403): ${body.slice(0, 300)}`);
  }
  if (res.status === 429 || res.status === 402 || res.status === 401)
    throw new HaltSync(`Google Maps request refused [${res.status}]: ${body.slice(0, 300)}`);
  throw new Error(`Google Maps request failed [${res.status}]: ${body.slice(0, 300)}`);
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function findPlaceId(v: DueVenue): Promise<string | null> {
  const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
    method: "POST",
    headers: {
      ...creds(),
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.id,places.location",
    },
    body: JSON.stringify({
      textQuery: v.name,
      pageSize: 5,
      locationBias: { circle: { center: { latitude: v.lat, longitude: v.lng }, radius: 500 } },
    }),
  });
  const json = (await check(res)) as { places?: Array<{ id: string; location?: { latitude: number; longitude: number } }> };
  let best: { id: string; d: number } | null = null;
  for (const p of json.places ?? []) {
    if (!p.location) continue;
    const d = distanceM(v.lat, v.lng, p.location.latitude, p.location.longitude);
    if (d <= MATCH_RADIUS_M && (!best || d < best.d)) best = { id: p.id, d };
  }
  return best?.id ?? null;
}

async function fetchDetails(placeId: string) {
  const res = await fetch(`${GATEWAY_URL}/places/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { ...creds(), "X-Goog-FieldMask": "displayName,regularOpeningHours,utcOffsetMinutes" },
  });
  return (await check(res)) as {
    displayName?: { text?: string };
    regularOpeningHours?: { periods?: unknown[]; weekdayDescriptions?: string[] };
    utcOffsetMinutes?: number;
  };
}

/** Refreshes one venue. Throws HaltSync for run-stopping errors. */
export async function syncVenueHours(admin: SupabaseClient, v: DueVenue): Promise<string> {
  const base = { venue_id: v.venue_id, agency_id: v.agency_id, event_id: v.event_id, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  try {
    const placeId = v.google_place_id ?? (await findPlaceId(v));
    if (!placeId) {
      await admin.from("venue_opening_hours").upsert({ ...base, sync_status: "not_found", sync_error: null });
      return "not_found";
    }
    const d = await fetchDetails(placeId);
    const hours = d.regularOpeningHours;
    const status = hours?.weekdayDescriptions?.length ? "ok" : "no_hours";
    const { error } = await admin.from("venue_opening_hours").upsert({
      ...base,
      google_place_id: placeId,
      google_place_name: d.displayName?.text ?? null,
      google_hours: hours ? { periods: hours.periods ?? [], weekdayDescriptions: hours.weekdayDescriptions ?? [] } : null,
      utc_offset_minutes: typeof d.utcOffsetMinutes === "number" ? d.utcOffsetMinutes : null,
      sync_status: status,
      sync_error: null,
    });
    if (error) throw new Error(error.message);
    return status;
  } catch (err) {
    if (err instanceof HaltSync) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("venue_opening_hours").upsert({ ...base, sync_status: "error", sync_error: msg.slice(0, 500) });
    return "error";
  }
}
