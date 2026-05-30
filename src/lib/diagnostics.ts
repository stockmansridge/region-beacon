import { useEffect, useState, useCallback } from "react";

/**
 * Local-only flag controlling whether platform_admin diagnostic panels render.
 * Stored per-browser; never sent to the server. Default: OFF.
 *
 * Default is OFF because diagnostic panels reveal internal resolution sources,
 * RPC results, agency/event IDs and the temporary legacy RPC host. Platform
 * admins opt in explicitly via the admin shell toggle when they need them.
 */
export const DIAGNOSTICS_STORAGE_KEY = "getstampd:diagnostics-enabled";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Reactive hook for the diagnostics-enabled flag. Re-renders subscribers
 * when the flag changes in the current tab (custom event) or any other tab
 * (native `storage` event).
 */
export function useDiagnosticsEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const onChange = () => setEnabled(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === DIAGNOSTICS_STORAGE_KEY) setEnabled(read());
    };
    window.addEventListener("getstampd:diagnostics-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("getstampd:diagnostics-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, v ? "true" : "false");
    } catch {
      // ignore
    }
    setEnabled(v);
    window.dispatchEvent(new Event("getstampd:diagnostics-changed"));
  }, []);

  return [enabled, set];
}

/** Format a labelled key/value report block for clipboard copy. */
export function formatDiagnosticReport(
  panelName: string,
  rows: Record<string, unknown>,
  opts?: { adminEmail?: string | null },
): string {
  const lines: string[] = [];
  lines.push(`# ${panelName}`);
  lines.push(`captured_at: ${new Date().toISOString()}`);
  if (typeof window !== "undefined") {
    lines.push(`page_url: ${window.location.href}`);
  }
  if (opts?.adminEmail) lines.push(`platform_admin: ${opts.adminEmail}`);
  lines.push("");
  for (const [k, v] of Object.entries(rows)) {
    const val =
      v === null || v === undefined
        ? "—"
        : typeof v === "string"
          ? v
          : JSON.stringify(v, null, 2);
    if (typeof val === "string" && val.includes("\n")) {
      lines.push(`${k}:`);
      lines.push(val);
    } else {
      lines.push(`${k}: ${val}`);
    }
  }
  return lines.join("\n");
}
