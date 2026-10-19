import { extractSubdomain } from "@/lib/domains";

export type ScannedQr =
  | { kind: "internal"; href: string }
  | { kind: "link"; href: string }
  | { kind: "text"; text: string }
  | { kind: "blocked" };

/** Decode all QR contents, but never execute QR-supplied scripts or change tenant context silently. */
export function resolveScannedQr(raw: string, currentHref: string): ScannedQr {
  const text = raw.trim();
  if (!text) return { kind: "blocked" };
  if (!text.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(text)) {
    return { kind: "text", text };
  }
  try {
    const current = new URL(currentHref);
    const url = new URL(text, current);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      return { kind: "blocked" };
    }
    const source = extractSubdomain(current.hostname);
    const target = extractSubdomain(url.hostname);
    const sameTenant = source?.sub && source.sub === target?.sub;
    const href = `${url.pathname}${url.search}${url.hash}`;
    // The original claim routes retain all passport, event and award validation.
    if ((url.origin === current.origin || sameTenant) &&
        /^\/(?:checkin|collect\/bonus|tasting)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
      return { kind: "internal", href };
    }
    // Other links require an explicit visitor click, including links to another event.
    return { kind: "link", href: url.href };
  } catch {
    return { kind: "text", text };
  }
}