import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";
import { QrScanner } from "@/components/qr-scanner";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { matchRootDomain } from "@/lib/domains";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { EventPaletteScope } from "@/components/event-palette-scope";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Scan venue QR" }] }),
  component: ScanRoute,
});

function ScanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <ScannerPage subdomain={subdomain} />;
}

type ErrState =
  | { kind: "none" }
  | { kind: "permission"; message: string }
  | { kind: "unsupported"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

function parseCheckinToken(raw: string): string | null {
  const trimmed = raw.trim();
  // Relative path
  const relMatch = trimmed.match(/^\/checkin\/([A-Za-z0-9_-]+)/);
  if (relMatch) return relMatch[1];
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!matchRootDomain(host)) return null;
    const m = url.pathname.match(/^\/checkin\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function ScannerPage({ subdomain }: { subdomain: string }) {
  const navigate = useNavigate();
  const [err, setErr] = useState<ErrState>({ kind: "none" });
  const [manual, setManual] = useState("");
  const [hasPassport, setHasPassport] = useState<boolean | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const { data } = await supabase.rpc("get_public_event_by_domain", { _hostname: host });
      if (cancelled) return;
      const evt = (data?.[0] ?? null) as { event_id?: string } | null;
      const eid = evt?.event_id ?? null;
      setEventId(eid);
      if (eid && typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(`gs.passport.${eid}`);
        setHasPassport(!!raw);
      } else {
        setHasPassport(false);
      }
    })();
    return () => { cancelled = true; };
  }, [subdomain]);

  const handleDecode = useCallback((text: string) => {
    const token = parseCheckinToken(text);
    if (!token) {
      setErr({ kind: "invalid", message: "That QR code is not a GetStampd venue check-in code." });
      return;
    }
    navigate({ to: "/checkin/$qrToken", params: { qrToken: token } });
  }, [navigate]);

  const handleError = useCallback((kind: "permission" | "unsupported" | "error", message: string) => {
    setErr({ kind, message });
  }, []);

  const tryManual = () => {
    const token = parseCheckinToken(manual);
    if (!token) {
      setErr({ kind: "invalid", message: "That doesn't look like a GetStampd check-in URL." });
      return;
    }
    navigate({ to: "/checkin/$qrToken", params: { qrToken: token } });
  };

  const buildSupport = () => {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
      route: "/scan",
      hostname,
      subdomain,
      eventId,
      hasSavedPassport: hasPassport,
      scannerError: err.kind === "none" ? null : { kind: err.kind, message: err.message },
    }, null, 2);
  };

  return (
    <div className="min-h-screen bg-[#F6EFE2] pb-12">
      <PublicAnnouncementBar subdomain={subdomain} />
      <div className="px-4"><PublicEventNav subdomain={subdomain} /></div>
      <div className="mx-auto max-w-md px-4 pt-4">
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
          Scan venue QR
        </h1>
        <p className="mt-2 text-sm text-[#3D372C]">
          Point your camera at the QR code on display at the venue to collect your stamp.
        </p>

        {hasPassport === false && eventId && (
          <div className="mt-4 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 text-sm text-[#3D372C]">
            You'll need a passport before you can collect stamps.
            <Link
              to="/join"
              className="ml-2 font-semibold text-[#1F3D2B] underline underline-offset-4"
            >
              Start your passport →
            </Link>
          </div>
        )}

        <div className="mt-5">
          {err.kind === "permission" || err.kind === "unsupported" ? (
            <div className="rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 text-sm text-[#3D372C]">
              <p className="font-semibold text-[#1F3D2B]">
                {err.kind === "permission" ? "Camera access was blocked." : "Camera not supported."}
              </p>
              <p className="mt-2">
                {err.kind === "permission"
                  ? "You can use your phone's Camera app to scan the venue QR code instead."
                  : "Try opening this page in Safari or Chrome on your phone, or use your phone's Camera app to scan the venue QR code."}
              </p>
              <Link
                to="/venues"
                className="mt-4 inline-block text-[11px] font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
              >
                ← Back to venues
              </Link>
            </div>
          ) : (
            <QrScanner onDecode={handleDecode} onError={handleError} />
          )}
        </div>

        {err.kind === "invalid" && (
          <div className="mt-3 rounded-xl border border-[#E6DCC7] bg-[#FBF5E8] px-3 py-2 text-xs text-[#3D372C]">
            {err.message}
          </div>
        )}
        {err.kind === "error" && (
          <div className="mt-3 rounded-xl border border-[#E6DCC7] bg-[#FBF5E8] px-3 py-2 text-xs text-[#3D372C]">
            Scanner error. {err.message}
          </div>
        )}

        <details className="mt-5 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 text-xs text-[#3D372C]">
          <summary className="cursor-pointer font-semibold text-[#1F3D2B]">
            Trouble scanning?
          </summary>
          <div className="mt-3 space-y-2">
            <p>Paste a check-in URL to test:</p>
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="https://…/checkin/<token>"
              className="w-full rounded-lg border border-[#E6DCC7] bg-white px-3 py-2 text-sm text-[#3D372C]"
            />
            <button
              type="button"
              onClick={tryManual}
              className="rounded-full bg-[#1F3D2B] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#FBF5E8]"
            >
              Go
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(buildSupport());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch { /* ignore */ }
              }}
              className="ml-2 rounded-full border border-[#1F3D2B] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#1F3D2B]"
            >
              {copied ? "Copied" : "Copy support details"}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
