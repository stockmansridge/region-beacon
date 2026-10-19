// Server-only: fetch venue opening hours from Google Places (New) via the
// Lovable connector gateway and store them. Never called on page views.
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

type PlaceDetails = {
  displayName?: { text?: string };
  formattedAddress?: string;
  regularOpeningHours?: { periods?: unknown[]; weekdayDescriptions?: string[] };
  utcOffsetMinutes?: number;
};

async function searchPlaces(v: DueVenue): Promise<PlaceCandidate[]> {
  const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
    method: "POST",
    headers: {
      ...creds(),
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: v.name,
      pageSize: 5,
      locationBias: { circle: { center: { latitude: v.lat, longitude: v.lng }, radius: 500 } },
    }),
  });
  const json = (await check(res)) as {
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

async function fetchDetails(placeId: string): Promise<PlaceDetails> {
  const res = await fetch(`${GATEWAY_URL}/places/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { ...creds(), "X-Goog-FieldMask": "displayName,formattedAddress,regularOpeningHours,utcOffsetMinutes" },
  });
  return (await check(res)) as PlaceDetails;
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
    let placeId: string | null = null;
    let details: PlaceDetails | null = null;
    let ambiguousNote: string | null = null;

    // Trust a stored place ID only while its identity still matches the venue.
    if (v.google_place_id) {
      const d = await fetchDetails(v.google_place_id);
      if (namesMatch(v.name, d.displayName?.text)) {
        placeId = v.google_place_id;
        details = d;
      }
    }
    if (!placeId) {
      const result = choosePlace(v, await searchPlaces(v));
      if (result.kind === "match") {
        placeId = result.id;
        details = await fetchDetails(placeId);
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
