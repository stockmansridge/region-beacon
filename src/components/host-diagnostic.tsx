import { useEffect, useState } from "react";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useAuth } from "@/hooks/use-auth";
import { describeHost } from "@/components/host-router";
import { useDiagnosticsEnabled, formatDiagnosticReport } from "@/lib/diagnostics";
import { DiagnosticCopyButton } from "@/components/diagnostic-panel";

/**
 * Source/reason for the resolved (or unresolved) tenant context.
 * Lets post-DNS smoke testers see *why* a host landed where it did.
 */
export type ResolutionSource =
  | "legacy_event_domain"
  | "agency_subdomain"
  | "public_event_slug"
  | "not_found"
  | "reserved"
  | "root"
  | "app";

type Extra = {
  resolvedAgencyId?: string | null;
  resolvedEventId?: string | null;
  resolutionSource?: ResolutionSource | null;
  /** Human-readable explanation when resolution fails or is interesting. */
  error?: string | null;
  /** Legacy alias for `error` — kept so existing callers continue to compile. */
  reason?: string | null;
};

/**
 * Platform-admin-only diagnostic panel. Renders nothing for normal visitors.
 *
 * Gating (defence in depth):
 *   1. The signed-in user MUST be platform_admin (server-checked via
 *      `useAdminAccess`).
 *   2. The platform admin MUST have explicitly enabled diagnostics from the
 *      admin shell toggle (localStorage flag).
 *
 * The previous anonymous `?diag=1` bypass has been removed — public visitors,
 * even with the query string, never see hostname classification, resolved
 * agency/event IDs, or resolution sources.
 */
export function HostDiagnostic(props: Extra) {
  const access = useAdminAccess();
  const { email } = useAuth();
  const [diagnosticsEnabled] = useDiagnosticsEnabled();
  const [open, setOpen] = useState(true);
  const [snapshot, setSnapshot] = useState<ReturnType<typeof describeHost> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSnapshot(describeHost(window.location.hostname, window.location.pathname));
  }, []);

  if (typeof window === "undefined" || !snapshot) return null;
  const isPlatformAdmin = access.status === "authorized" && access.isPlatformAdmin;
  if (!isPlatformAdmin || !diagnosticsEnabled) return null;

  // Derive resolutionSource from classification if the caller didn't provide one.
  const derivedSource: ResolutionSource | null = (() => {
    if (props.resolutionSource) return props.resolutionSource;
    switch (snapshot.classification) {
      case "root":
        return "root";
      case "app":
        return "app";
      case "reserved":
        return "reserved";
      default:
        return null;
    }
  })();

  const errorMessage = props.error ?? props.reason ?? null;

  const rows = {
    hostname: snapshot.hostname,
    pathname: snapshot.pathname,
    root_domain: snapshot.rootDomain,
    classification: snapshot.classification,
    subdomain: snapshot.subdomain,
    rewrite_to: snapshot.rewriteTo,
    resolved_agency_id: props.resolvedAgencyId ?? null,
    resolved_event_id: props.resolvedEventId ?? null,
    resolution_source: derivedSource,
    error: errorMessage,
  };

  const getReport = () =>
    formatDiagnosticReport("Host diagnostic", rows, { adminEmail: email });

  return (
    <div className="fixed bottom-3 right-3 z-[9999] max-w-sm rounded-lg border border-amber-300 bg-amber-50/95 p-3 text-xs text-amber-900 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">Host diagnostic</span>
        <div className="flex items-center gap-2">
          <DiagnosticCopyButton getReport={getReport} />
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider hover:bg-amber-200"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white/70 p-2 text-[11px] leading-snug">
{JSON.stringify(rows, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
