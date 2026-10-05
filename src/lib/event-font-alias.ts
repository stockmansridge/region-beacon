// Pure (browser/server/test safe) helpers for V2 event-scoped custom font aliases.
// V1 pages keep using the raw family name; only V2 uses these aliases.
import { isSupportedEventFont } from "@/lib/event-fonts";

/** FNV-1a 32-bit hash, hex. Deterministic and dependency-free. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function primaryFontFamily(value: string): string {
  return value.split(",")[0].replace(/['"]/g, "").trim();
}

/**
 * Collision-resistant alias for an uploaded family inside one event.
 * The hash covers the exact (case-folded, trimmed) family, so "A B" and "AB"
 * never share an alias; the event id keeps two events with the same name apart.
 * Case-folding matches the case-insensitive family lookup used to find the file.
 */
export function eventScopedCustomFontFamily(family: string, eventId: string): string {
  const exact = primaryFontFamily(family).toLowerCase();
  const safeEvent = eventId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  const slug = exact.replace(/[^a-z0-9]/g, "").slice(0, 24);
  return `gs-${safeEvent}-${slug}-${fnv1a(`${eventId}|${exact}`)}`;
}

/** CSS font-family value for V2 rendering: curated fonts unchanged, uploaded fonts via the event alias. */
export function v2FontFamilyValue(value: string, eventId: string | null | undefined): string {
  if (!eventId || isSupportedEventFont(value)) return value;
  return `'${eventScopedCustomFontFamily(value, eventId)}', ui-sans-serif, system-ui, sans-serif`;
}
