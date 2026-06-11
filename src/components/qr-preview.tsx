import { useEffect, useState } from "react";
// Use the browser entry directly — it avoids `node:fs` (imported by the
// default entry) and is bundled into the admin chunk so we don't depend on
// a fragile dynamic import that can 404 after a redeploy with a new hash.
// @ts-expect-error — qrcode types only describe the default entry; the browser entry has the same toDataURL surface.
import QRCode from "qrcode/lib/browser";
import { generateQrPosterPdf, type PosterInput } from "@/lib/qr-poster";
import { normaliseQrUrl } from "@/lib/qr-url";

type Props = {
  /** URL to encode in the QR. */
  value: string;
  /** Filename (without extension) for the downloaded PNG. */
  downloadName?: string;
  /** Rendered size in CSS pixels. The PNG itself is rendered at higher resolution. */
  size?: number;
  /**
   * Optional poster context. When provided, a "Download poster PDF" button is
   * shown which generates an A4 poster client-side using the same URL as the
   * QR image. Nothing is uploaded or stored.
   */
  poster?: {
    eventName: string;
    venueName: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    accentColor?: string | null;
    offerSummary?: string | null;
    entryValue?: number | null;
    /** Filename (with .pdf extension). */
    filename: string;
  };
};

function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    msg,
  );
}

/**
 * Renders a QR code image from a URL, with a Download PNG action.
 * Generation happens entirely in the browser; nothing is stored or uploaded.
 */
export function QrPreview({ value, downloadName = "qr-code", size = 160, poster }: Props) {
  const normalisedValue = normaliseQrUrl(value);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStale(false);
    setDataUrl(null);
    if (!normalisedValue) {
      setError("No QR value yet.");
      return;
    }
    // Render at 4x for a crisp downloadable PNG.
    QRCode.toDataURL(normalisedValue, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size * 4,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url: string) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[qr-preview] failed to render QR", { value: normalisedValue, err });
        if (cancelled) return;
        if (isStaleChunkError(err)) {
          setStale(true);
          setError(
            "An updated version of GetStampd is available. Refresh this page to reload the latest admin tools.",
          );
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`QR preview could not load${msg ? `: ${msg}` : "."}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalisedValue, size]);



  function downloadPng() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${downloadName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function downloadPoster() {
    if (!poster) return;
    setPosterError(null);
    setPosterBusy(true);
    try {
      const payload: PosterInput = {
        eventName: poster.eventName,
        venueName: poster.venueName,
        checkinUrl: normalisedValue,
        logoUrl: poster.logoUrl ?? null,
        primaryColor: poster.primaryColor ?? null,
        accentColor: poster.accentColor ?? null,
        offerSummary: poster.offerSummary ?? null,
        entryValue: poster.entryValue ?? null,
      };
      await generateQrPosterPdf(payload, poster.filename);
    } catch {
      setPosterError("Could not generate poster PDF. Please try again.");
    } finally {
      setPosterBusy(false);
    }
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (!dataUrl) {
    return (
      <div
        className="rounded-md border bg-muted/30"
        style={{ width: size, height: size }}
        aria-label="Generating QR code"
      />
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <img
        src={dataUrl}
        alt="QR code"
        width={size}
        height={size}
        className="rounded-md border bg-white p-2"
      />
      {poster?.venueName && (
        <div className="space-y-0.5 text-xs">
          <div className="font-semibold text-foreground">
            QR Code for: {poster.venueName}
          </div>
          {poster.offerSummary && (
            <div className="text-muted-foreground">
              Special: {poster.offerSummary}
            </div>
          )}
          {typeof poster.entryValue === "number" && poster.entryValue > 1 && (
            <div className="font-medium text-foreground">
              Stamp value: {poster.entryValue} entries
            </div>
          )}
          {poster.entryValue === 1 && (
            <div className="text-muted-foreground">Stamp value: 1 entry</div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadPng}
          className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
        >
          Download QR PNG
        </button>
        {poster && (
          <button
            type="button"
            onClick={downloadPoster}
            disabled={posterBusy}
            className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {posterBusy ? "Generating…" : "Download poster PDF"}
          </button>
        )}
      </div>
      {posterError && <p className="text-xs text-destructive">{posterError}</p>}
    </div>
  );
}
