export type AnalyticsDateFilter = "all" | "1d" | "7d" | "14d" | "30d" | "custom";

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