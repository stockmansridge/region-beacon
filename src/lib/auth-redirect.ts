/**
 * Auth redirect base URL resolver.
 *
 * Supabase confirmation/recovery emails and post-auth redirects must point
 * to a real production host — NEVER to localhost or a Lovable preview URL,
 * because those origins won't be reachable from a user's inbox.
 *
 * Rules:
 * - In production browsers on a getstampd.com.au / getstampd.com host →
 *   return the current origin (so app.getstampd.com.au, getstampd.com.au, etc.
 *   each stay on their own origin and localStorage works).
 * - In dev (localhost) or Lovable preview hosts → return the configured
 *   production AUTH_BASE_URL so confirmation emails always go to prod.
 * - SSR / no window → fall back to AUTH_BASE_URL.
 */

export const AUTH_BASE_URL = "https://app.getstampd.com.au";

const PROD_HOST_SUFFIXES = [
  "getstampd.com.au",
  "getstampd.com",
];

export function getAuthBaseUrl(): string {
  if (typeof window === "undefined") return AUTH_BASE_URL;
  try {
    const host = window.location.hostname.toLowerCase();
    const isProdHost = PROD_HOST_SUFFIXES.some(
      (suf) => host === suf || host.endsWith(`.${suf}`),
    );
    if (isProdHost) return window.location.origin;
  } catch {
    /* ignore */
  }
  return AUTH_BASE_URL;
}

/** Build an absolute URL on the production (or current prod) auth origin. */
export function authUrl(path: string = "/"): string {
  const base = getAuthBaseUrl().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * True when the current browser origin is NOT the production auth origin
 * — i.e. we should send users cross-origin (full anchor link) to /signup
 * rather than client-side route to it on the marketing apex.
 */
export function isOnAuthOrigin(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.location.origin === getAuthBaseUrl();
  } catch {
    return true;
  }
}

/**
 * Strip access_token / refresh_token / type fragments from the URL bar after
 * Supabase has consumed the recovery/confirmation hash. Safe to call multiple
 * times; no-op if there is nothing to clean.
 */
export function cleanAuthUrlFragments(): void {
  if (typeof window === "undefined") return;
  try {
    const { hash, search, pathname } = window.location;
    let changed = false;

    if (hash && /(?:^|[#&])(access_token|refresh_token|type)=/.test(hash)) {
      changed = true;
    }
    const params = new URLSearchParams(search);
    let searchChanged = false;
    for (const k of ["access_token", "refresh_token", "type", "code"]) {
      if (params.has(k)) {
        params.delete(k);
        searchChanged = true;
      }
    }
    if (searchChanged) changed = true;
    if (!changed) return;

    const nextSearch = params.toString();
    const nextUrl =
      pathname + (nextSearch ? `?${nextSearch}` : "") + ""; // drop hash
    window.history.replaceState({}, "", nextUrl);
  } catch {
    /* ignore */
  }
}
