import data from "@/data/australian-postcode-regions.json";

const lookup: Record<string, (string | boolean)[]> = data;
export function postcodeRegion(postcode: string) {
  const key = postcode.trim();
  const row = /^\d{4}$/.test(key) ? lookup[key] : undefined;
  return row ? { state: String(row[0]), area: String(row[1]), statisticalArea: String(row[2]), approximate: Boolean(row[3]) } : null;
}
export function regionalBreakdown(rows: Array<{ postcode: string; count: number }>, dimension: "state" | "area") {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const region = postcodeRegion(row.postcode);
    const label = region ? dimension === "state" ? region.state : `${region.area} · ${region.state}` : "Unknown / unmapped";
    counts.set(label, (counts.get(label) ?? 0) + row.count);
    total += row.count;
  }
  return Array.from(counts, ([label, count]) => ({ label, count, pct: total ? count / total * 100 : 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}