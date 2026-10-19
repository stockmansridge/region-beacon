// Server-only: Google Places (New), direct on the independent Cloudflare
// build and via the connector on Lovable. Never called on page views.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readServerEnv } from "@/lib/server-env.server";
import { choosePlace, namesMatch, type PlaceCandidate } from "@/lib/venue-hours-match";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type DueVenue = {
  venue_id: string;
  agency_id: string;
  event_id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  google_place_id: string | null;
};

/** Stops the whole run (key/quota problems) instead of failing one venue. */
export class HaltSync extends Error {}

type Transport = { baseUrl: string; headers: Record<string, string>; secrets: string[] };

function transport(): Transport {
  // This is the existing CI build target, not hostname/browser detection.
  // Fail closed on Cloudflare: connector keys are not Google API keys.
  if (import.meta.env.VITE_DEPLOY_TARGET === "cloudflare") {
    const key = readServerEnv("GOOGLE_PLACES_API_KEY");
    if (!key) throw new HaltSync("Missing Cloudflare Worker secret GOOGLE_PLACES_API_KEY on region-beacon.");
    return { baseUrl: "https://places.googleapis.com/v1", headers: { "X-Goog-Api-Key": key }, secrets: [key] };
  }
  const lovable = readServerEnv("LOVABLE_API_KEY");
  // Prefer the owner's dedicated server key (restricted to Places API (New));
  // fall back to the Lovable-managed connection.
  const maps = readServerEnv("GOOGLE_MAPS_API_KEY_1") ?? readServerEnv("GOOGLE_MAPS_API_KEY");
  if (!lovable || !maps) throw new HaltSync("Google Maps connection is not configured on this server.");
  return { baseUrl: `${GATEWAY_URL}/places/v1`, headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps }, secrets: [lovable, maps] };
}

async function check(res: Response, config: Transport): Promise<unknown> {
  if (res.ok) return res.json();
  let body = await res.text();
  // Provider errors may echo credentials; never persist or return those.
  for (const secret of config.secrets) body = body.split(secret).join("[redacted]");
  if (body.includes("API_KEY_INVALID"))
    throw new HaltSync(`Google Places credentials are invalid [${res.status}]: ${body.slice(0, 300)}`);
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

type PlaceDetails = {
  displayName?: { text?: string };
  formattedAddress?: string;
  regularOpeningHours?: { periods?: unknown[]; weekdayDescriptions?: string[] };
  utcOffsetMinutes?: number;
};

async function searchPlaces(v: DueVenue, config: Transport): Promise<PlaceCandidate[]> {
  const res = await fetch(`${config.baseUrl}/places:searchText`, {
    method: "POST",
    headers: {
      ...config.headers,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: v.name,
      pageSize: 5,
      locationBias: { circle: { center: { latitude: v.lat, longitude: v.lng }, radius: 500 } },
    }),
  });
  const json = (await check(res, config)) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }>;
  };
  return (json.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? null,
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  }));
}

async function fetchDetails(placeId: string, config: Transport): Promise<PlaceDetails> {
  const res = await fetch(`${config.baseUrl}/places/${encodeURIComponent(placeId)}`, {
    headers: { ...config.headers, "X-Goog-FieldMask": "displayName,formattedAddress,regularOpeningHours,utcOffsetMinutes" },
  });
  return (await check(res, config)) as PlaceDetails;
}

type ExistingRow = {
  google_place_id: string | null;
  google_place_name: string | null;
  google_hours: unknown;
  utc_offset_minutes: number | null;
  hours_source: string;
  synced_at: string | null;
} | null;

async function readExisting(admin: SupabaseClient, venueId: string): Promise<ExistingRow> {
  const { data } = await admin
    .from("venue_opening_hours")
    .select("google_place_id, google_place_name, google_hours, utc_offset_minutes, hours_source, synced_at")
    .eq("venue_id", venueId)
    .maybeSingle();
  return (data as ExistingRow) ?? null;
}

/**
 * Refreshes one venue. Throws HaltSync for run-stopping errors.
 *
 * Last-known-good policy: `synced_at` is only bumped when Google data is
 * actually confirmed (ok/no_hours). On transient errors, no defensible match
 * or ambiguous listings, the previously stored hours, place identity and
 * `synced_at` are preserved — so the public page can keep showing recently
 * validated hours (bounded by the public read function's staleness window)
 * instead of going blank. Manual/off preferences are never touched here.
 */
export async function syncVenueHours(admin: SupabaseClient, v: DueVenue): Promise<string> {
  const base = { venue_id: v.venue_id, agency_id: v.agency_id, event_id: v.event_id, updated_at: new Date().toISOString() };
  try {
    const config = transport();
    let placeId: string | null = null;
    let details: PlaceDetails | null = null;
    let ambiguousNote: string | null = null;

    // Trust a stored place ID only while its identity still matches the venue.
    if (v.google_place_id) {
      const d = await fetchDetails(v.google_place_id, config);
      if (namesMatch(v.name, d.displayName?.text)) {
        placeId = v.google_place_id;
        details = d;
      }
    }
    if (!placeId) {
      const result = choosePlace(v, await searchPlaces(v, config));
      if (result.kind === "match") {
        placeId = result.id;
        details = await fetchDetails(placeId, config);
      } else if (result.kind === "ambiguous") {
        ambiguousNote = `Ambiguous Google listings (${result.candidates.length} name matches within 200 m) — held for review, no hours assigned.`;
      }
    }

    const existing = await readExisting(admin, v.venue_id);

    if (!placeId || !details) {
      // No defensible match: keep last-known-good hours and their validation
      // time; only the status changes.
      const { error } = await admin.from("venue_opening_hours").upsert({
        ...base,
        google_place_id: existing?.google_place_id ?? null,
        google_place_name: existing?.google_place_name ?? null,
        google_hours: existing?.google_hours ?? null,
        utc_offset_minutes: existing?.utc_offset_minutes ?? null,
        synced_at: existing?.synced_at ?? null,
        sync_status: "not_found",
        sync_error: ambiguousNote,
      });
      if (error) throw new Error(error.message);
      return "not_found";
    }

    const hours = details.regularOpeningHours;
    const status = hours?.weekdayDescriptions?.length ? "ok" : "no_hours";
    const { error } = await admin.from("venue_opening_hours").upsert({
      ...base,
      google_place_id: placeId,
      google_place_name: details.displayName?.text ?? null,
      google_hours: hours ? { periods: hours.periods ?? [], weekdayDescriptions: hours.weekdayDescriptions ?? [] } : null,
      utc_offset_minutes: typeof details.utcOffsetMinutes === "number" ? details.utcOffsetMinutes : null,
      synced_at: new Date().toISOString(),
      sync_status: status,
      sync_error: null,
    });
    if (error) throw new Error(error.message);
    return status;
  } catch (err) {
    if (err instanceof HaltSync) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    // Preserve last-known-good hours and their validation time on transient
    // failures; never wipe them.
    const existing = await readExisting(admin, v.venue_id).catch(() => null);
    await admin.from("venue_opening_hours").upsert({
      ...base,
      google_place_id: existing?.google_place_id ?? null,
      google_place_name: existing?.google_place_name ?? null,
      google_hours: existing?.google_hours ?? null,
      utc_offset_minutes: existing?.utc_offset_minutes ?? null,
      synced_at: existing?.synced_at ?? null,
      sync_status: "error",
      sync_error: msg.slice(0, 500),
    });
    return "error";
  }
}
