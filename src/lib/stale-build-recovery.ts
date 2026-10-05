import { classifyHost } from "@/components/host-router";
import { eventNavBaseFromPathname } from "@/components/public-nav-context";

/**
 * Precaution (cause not proven): after a release, a public page left open may request
 * the previous build's code files. Recover with ONE full reload, only on public event
 * pages, and fail closed when the one-shot guard cannot be stored.
 */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|Unable to preload CSS/i;

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return CHUNK_ERROR.test(message);
}

const NON_PUBLIC_PREFIXES = ["/admin", "/auth", "/login", "/signup", "/reset-password", "/workspace"];

/** Public event context: a tenant event host, or an event-scoped /live/<subdomain> path. Never admin/auth/editor. */
export function isPublicEventContext(hostname: string, pathname: string): boolean {
  if (NON_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}.`))) return false;
  if (eventNavBaseFromPathname(pathname)) return true;
  return classifyHost(hostname).kind === "tenant";
}

export function reloadOnceForStaleBuild(
  win: Pick<Window, "location" | "sessionStorage"> | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!win) return false;
  const { hostname, pathname, search } = win.location;
  if (!isPublicEventContext(hostname, pathname)) return false;
  const key = `stale-build-reload:${pathname}${search}`;
  try {
    if (win.sessionStorage.getItem(key)) return false;
    win.sessionStorage.setItem(key, "1");
    if (win.sessionStorage.getItem(key) !== "1") return false;
  } catch {
    return false; // guard unavailable: fail closed, show the normal "Try again" screen
  }
  win.location.reload();
  return true;
}
