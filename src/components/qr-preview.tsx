import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  /** URL to encode in the QR. */
  value: string;
  /** Filename (without extension) for the downloaded PNG. */
  downloadName?: string;
  /** Rendered size in CSS pixels. The PNG itself is rendered at higher resolution. */
  size?: number;
};

/**
 * Renders a QR code image from a URL, with a Download PNG action.
 * Generation happens entirely in the browser; nothing is stored or uploaded.
 */
export function QrPreview({ value, downloadName = "qr-code", size = 160 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <button
        type="button"
        onClick={downloadPng}
        className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
      >
        Download QR PNG
      </button>
    </div>
  );
}
