/**
 * Normalise a user-entered website URL to https://.
 *
 * Rules:
 *  - Empty / whitespace input → null
 *  - Already starts with https:// → return as entered (trimmed)
 *  - Starts with http:// → upgraded to https://
 *  - Starts with // (protocol-relative) → prefixed with https:
 *  - Anything else (e.g. "example.com", "www.example.com") → prefixed with https://
 *
 * This intentionally does NOT validate hostname/path beyond the protocol.
 * Callers should still bound length and sanitize before persisting.
 */
export function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) return null;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return "https://" + trimmed.slice(7);
  if (trimmed.startsWith("//")) return "https:" + trimmed;
  return "https://" + trimmed.replace(/^\/+/, "");
}
