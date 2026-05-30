import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { generateQrPosterPdf, type PosterInput } from "@/lib/qr-poster";

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
    /** Filename (with .pdf extension). */
    filename: string;
  };
};

/**
 * Renders a QR code image from a URL, with a Download PNG action.
 * Generation happens entirely in the browser; nothing is stored or uploaded.
 */
export function QrPreview({ value, downloadName = "qr-code", size = 160, poster }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDataUrl(null);
    // Render at 4x for a crisp downloadable PNG.
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size * 4,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not render QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

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
        checkinUrl: value,
        logoUrl: poster.logoUrl ?? null,
        primaryColor: poster.primaryColor ?? null,
        accentColor: poster.accentColor ?? null,
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
