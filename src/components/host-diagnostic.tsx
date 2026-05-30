import { useEffect, useState } from "react";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { describeHost } from "@/components/host-router";

type Extra = {
  resolvedAgencyId?: string | null;
  resolvedEventId?: string | null;
  reason?: string | null;
};

/**
 * Platform-admin-only diagnostic panel. Renders nothing for normal visitors.
 * Shows hostname, route classification, resolved tenant/event ids and a
 * "Copy diagnostic" button. Visible when the signed-in user is
 * platform_admin OR when the URL contains ?diag=1 (for support).
 */
export function HostDiagnostic(props: Extra) {
  const access = useAdminAccess();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [snapshot, setSnapshot] = useState<ReturnType<typeof describeHost> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSnapshot(describeHost(window.location.hostname, window.location.pathname));
  }, []);

  if (typeof window === "undefined" || !snapshot) return null;
  const params = new URLSearchParams(window.location.search);
  const diagQuery = params.get("diag") === "1";
  const isPlatformAdmin = access.status === "authorized" && access.isPlatformAdmin;
  if (!isPlatformAdmin && !diagQuery) return null;

  const payload = {
    ...snapshot,
    resolvedAgencyId: props.resolvedAgencyId ?? null,
    resolvedEventId: props.resolvedEventId ?? null,
    reason: props.reason ?? null,
    href: window.location.href,
    capturedAt: new Date().toISOString(),
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-[9999] max-w-sm rounded-lg border border-amber-300 bg-amber-50/95 p-3 text-xs text-amber-900 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">Host diagnostic</span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider hover:bg-amber-200"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open ? (
        <>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white/70 p-2 text-[11px] leading-snug">
{JSON.stringify(payload, null, 2)}
          </pre>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={copy}
              className="rounded bg-amber-900 px-2 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-800"
            >
              {copied ? "Copied" : "Copy diagnostic"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
