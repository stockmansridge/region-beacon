/**
 * Normalises a value destined for a QR code so the QR renderer always
 * receives a usable string. The QR encoder expects a non-empty string
 * (it throws on empty input). For public URLs we also ensure a protocol
 * is present so scanning the code opens the link in a browser.
 *
 * Rules:
 *  - empty / whitespace -> empty string (caller should not render)
 *  - already has http(s):// -> returned as-is
 *  - starts with "/" -> returned as-is (relative preview / demo path)
 *  - looks like a bare domain (contains a dot, no spaces) -> prefixed
 *    with "https://"
 *  - anything else -> returned as-is (token-only fallbacks, etc.)
 */
export function normaliseQrUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  const value = String(raw).trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(value)) {
    return `https://${value}`;
  }
  return value;
}
