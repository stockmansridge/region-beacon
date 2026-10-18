export type AnalyticsDateFilter = "all" | "1d" | "7d" | "14d" | "30d" | "custom";

export function countPassportsWithVenueVisits(passportStamps: ReadonlyMap<string, ReadonlySet<string>>, minimum: number): number {
  let count = 0;
  for (const venues of passportStamps.values()) if (venues.size >= minimum) count++;
  return count;
}

export function venueCheckinDays(
  checkins: Array<{ venue_id: string; created_at: string }>,
  venueId: string,
  from: Date | null = null,
  to: Date | null = null,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const c of checkins) {
    const time = new Date(c.created_at);
    if (c.venue_id !== venueId || !Number.isFinite(time.getTime()) || (from && time < from) || (to && time > to)) continue;
    const day = time.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const keys = Array.from(counts.keys()).sort();
  const start = from?.toISOString().slice(0, 10) ?? keys[0];
  const end = to?.toISOString().slice(0, 10) ?? keys.at(-1);
  if (!start || !end || start > end) return [];
  const days: Array<[string, number]> = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
    const day = new Date(time).toISOString().slice(0, 10);
    days.push([day, counts.get(day) ?? 0]);
  }
  return days;
}

export function analyticsDateRange(filter: AnalyticsDateFilter, now: Date, custom?: { from?: Date; to?: Date }) {
  if (filter === "all") return { from: null, to: null };
  if (filter === "custom") {
    const from = custom?.from ? new Date(custom.from) : null;
    const to = custom?.to ? new Date(custom.to) : null;
    from?.setHours(0, 0, 0, 0);
    to?.setHours(23, 59, 59, 999);
    return { from, to };
  }
  const days = { "1d": 1, "7d": 7, "14d": 14, "30d": 30 }[filter];
  return { from: new Date(now.getTime() - days * 86400000), to: now };
}

export function venueEngagement(
  venues: Array<{ id: string; name: string; event_id: string }>,
  checkins: Array<{ venue_id: string; passport_id: string; created_at: string }>,
  bonus: Array<{ participant_id: string; source_id: string | null; created_at: string; metadata: { venue_id?: string | null } | null }>,
  bonusVenues: Array<{ id: string; venue_id: string | null }>,
) {
  const sourceVenue = new Map(bonusVenues.map(v => [v.id, v.venue_id]));
  const rows = new Map(venues.map(v => [v.id, { venue_id: v.id, name: v.name, event_id: v.event_id, count: 0, bonus: 0, people: new Set<string>(), last: "" }]));
  for (const c of checkins) {
    const row = rows.get(c.venue_id);
    if (!row) continue;
    row.count++;
    row.people.add(c.passport_id);
    if (c.created_at > row.last) row.last = c.created_at;
  }
  for (const b of bonus) {
    const id = b.metadata?.venue_id ?? (b.source_id ? sourceVenue.get(b.source_id) : null);
    const row = id ? rows.get(id) : undefined;
    if (!row) continue;
    row.bonus++;
    row.people.add(b.participant_id);
    if (b.created_at > row.last) row.last = b.created_at;
  }
  return Array.from(rows.values()).map(({ people, ...r }) => ({ ...r, unique: people.size, scans: r.count + r.bonus, pct: checkins.length ? r.count / checkins.length * 100 : 0 })).sort((a, b) => b.scans - a.scans || a.name.localeCompare(b.name));
}

export function awardQualified(points: number, visited: number, activeVenues: number, award: { points_required: number; requires_all_locations: boolean }) {
  return points >= award.points_required && (!award.requires_all_locations || (activeVenues > 0 && visited >= activeVenues));
}

export function bonusItemTotals(
  scans: Array<{ event_id: string; source_id: string | null; points_awarded: number; metadata: { bonus_code_name?: string | null } | null }>,
  labels: Map<string, string>,
) {
  const items = new Map<string, { key: string; event_id: string; name: string; scans: number; points: number }>();
  for (const scan of scans) {
    const key = `${scan.event_id}:${scan.source_id ?? "unknown"}`;
    const item = items.get(key) ?? {
      key, event_id: scan.event_id,
      name: (scan.source_id ? labels.get(scan.source_id) : null) || scan.metadata?.bonus_code_name || "Unknown code",
      scans: 0, points: 0,
    };
    item.scans++;
    item.points += scan.points_awarded ?? 0;
    items.set(key, item);
  }
  return Array.from(items.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

const VENUE_PATH_RE = /^\/venues\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Pages stats: show the venue's name for paths like /venues/<venue-uuid>
// instead of the raw UUID. Falls back to the raw path when the venue is
// unknown (e.g. deleted venue or another organisation's venue).
export function describePagePath(path: string, venueNameById: Map<string, string>): string {
  const match = path.match(VENUE_PATH_RE);
  if (!match) return path;
  const name = venueNameById.get(match[1].toLowerCase());
  if (!name) return path;
  return `${name} — venue details`;
}
