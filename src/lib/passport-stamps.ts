import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_VENUE_LABEL_PLURAL,
  DEFAULT_VENUE_LABEL_SINGULAR,
} from "@/lib/venue-labels";

export type PassportStampVenue = {
  passport_id: string | null;
  event_id: string | null;
  event_name: string | null;
  venue_label_singular: string | null;
  venue_label_plural: string | null;
  total_venues: number | null;
  stamped_count: number | null;
  venue_id: string;
  venue_name: string | null;
  venue_logo_path: string | null;
  venue_cover_path: string | null;
  order_index: number | null;
  is_stamped: boolean;
  checked_in_at: string | null;
};

type RawStampRow = Record<string, unknown>;

export type PassportStampState = {
  status: "idle" | "missing_token" | "ok" | "error";
  error: string | null;
  eventName: string | null;
  labelSingular: string;
  labelPlural: string;
  allVenues: PassportStampVenue[];
  visitedVenueIds: Set<string>;
  visitedCount: number;
  totalVenueCount: number;
  rowCount: number;
  stampedRowCount: number;
  firstRowFieldNames: string[];
};

export const EMPTY_PASSPORT_STAMP_STATE: PassportStampState = {
  status: "idle",
  error: null,
  eventName: null,
  labelSingular: DEFAULT_VENUE_LABEL_SINGULAR,
  labelPlural: DEFAULT_VENUE_LABEL_PLURAL,
  allVenues: [],
  visitedVenueIds: new Set<string>(),
  visitedCount: 0,
  totalVenueCount: 0,
  rowCount: 0,
  stampedRowCount: 0,
  firstRowFieldNames: [],
};

export async function loadPassportStampState(
  token: string | null | undefined,
): Promise<PassportStampState> {
  if (!token) return { ...EMPTY_PASSPORT_STAMP_STATE, status: "missing_token" };
  try {
    const { data, error } = await supabase.rpc("get_passport_stamps_by_token" as never, {
      _raw_token: token,
    } as never);
    if (error) {
      return { ...EMPTY_PASSPORT_STAMP_STATE, status: "error", error: error.message };
    }
    return normalizePassportStampRows((data ?? []) as RawStampRow[]);
  } catch (e) {
    return {
      ...EMPTY_PASSPORT_STAMP_STATE,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function normalizePassportStampRows(rows: RawStampRow[]): PassportStampState {
  const first = rows[0] ?? null;
  const allVenues = rows
    .map((row) => normalizeStampRow(row))
    .filter((row): row is PassportStampVenue => !!row?.venue_id);
  const visitedVenueIds = new Set<string>();
  for (const venue of allVenues) {
    if (venue.is_stamped) visitedVenueIds.add(String(venue.venue_id));
  }
  const stampedRowCount = allVenues.filter((venue) => venue.is_stamped).length;
  const totalFromRpc = numberValue(first?.total_venues);
  const stampedFromRpc = numberValue(first?.stamped_count);

  return {
    status: "ok",
    error: null,
    eventName: stringValue(first?.event_name),
    labelSingular:
      stringValue(first?.venue_label_singular)?.trim() || DEFAULT_VENUE_LABEL_SINGULAR,
    labelPlural:
      stringValue(first?.venue_label_plural)?.trim() || DEFAULT_VENUE_LABEL_PLURAL,
    allVenues,
    visitedVenueIds,
    visitedCount: stampedFromRpc ?? visitedVenueIds.size,
    totalVenueCount: totalFromRpc ?? allVenues.length,
    rowCount: rows.length,
    stampedRowCount,
    firstRowFieldNames: first ? Object.keys(first) : [],
  };
}

function normalizeStampRow(row: RawStampRow): PassportStampVenue | null {
  const venueId = stringValue(row.venue_id);
  if (!venueId) return null;
  const stamped = booleanValue(row.is_stamped ?? row.stamped ?? row.visited);
  return {
    passport_id: stringValue(row.passport_id),
    event_id: stringValue(row.event_id),
    event_name: stringValue(row.event_name),
    venue_label_singular: stringValue(row.venue_label_singular),
    venue_label_plural: stringValue(row.venue_label_plural),
    total_venues: numberValue(row.total_venues),
    stamped_count: numberValue(row.stamped_count),
    venue_id: venueId,
    venue_name: stringValue(row.venue_name),
    venue_logo_path: stringValue(row.venue_logo_path),
    venue_cover_path: stringValue(row.venue_cover_path),
    order_index: numberValue(row.order_index),
    is_stamped: stamped,
    checked_in_at: stringValue(row.checked_in_at ?? row.stamped_at),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}