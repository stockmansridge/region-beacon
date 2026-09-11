// Browser-only QR PNG renderer shared by the QR preview component and bulk
// (ZIP) downloads, so a single code path controls how QR images look.
//
// IMPORTANT: never statically import `qrcode` at module scope anywhere that can
// reach the server bundle — its main entry imports `node:fs` and crashes the
// Cloudflare Worker SSR build. This module lazy-imports it inside the function
// and is only ever called from the browser.

import { normaliseQrUrl } from "@/lib/qr-url";

export type QrPngOptions = {
  /** URL to encode. */
  value: string;
  /** Rendered CSS size; the PNG is generated at 4x this. */
  size?: number;
  /** Optional Arial caption composited under the QR. */
  caption?: string | null;
};

/**
 * Returns a PNG data URL of the QR code (optionally with a caption band).
 * Rendering is identical to what the single-code preview downloads.
 */
export async function renderQrPngDataUrl({
  value,
  size = 160,
  caption,
}: QrPngOptions): Promise<string> {
  const normalisedValue = normaliseQrUrl(value);
  if (!normalisedValue) throw new Error("No QR value");
  if (typeof window === "undefined") throw new Error("Browser only");

  const mod = (await import("qrcode")) as unknown as {
    default?: typeof import("qrcode");
  } & typeof import("qrcode");
  const QRCode = mod.default ?? mod;
  const qrPx = size * 4;
  const url = await QRCode.toDataURL(normalisedValue, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: qrPx,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const trimmedCaption = caption?.trim();
  if (!trimmedCaption) return url;

  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("QR image failed to load"));
  });

  const fontPx = Math.max(24, Math.round(qrPx * 0.06));
  const lineHeight = Math.round(fontPx * 1.2);
  const paddingTop = Math.round(fontPx * 0.6);
  const paddingBottom = Math.round(fontPx * 0.8);
  const maxLines = 2;
  const canvas = document.createElement("canvas");
  canvas.width = qrPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return url;

  ctx.font = `bold ${fontPx}px Arial, sans-serif`;
  const maxWidth = qrPx - fontPx;
  const words = trimmedCaption.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth) {
      current = attempt;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const joined = lines.join(" ");
    if (joined.length < trimmedCaption.length) {
      let last = lines[maxLines - 1];
      while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }

  const captionBand = paddingTop + lines.length * lineHeight + paddingBottom;
  canvas.height = qrPx + captionBand;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, qrPx, qrPx);
  ctx.fillStyle = "#000000";
  ctx.font = `bold ${fontPx}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    const y = qrPx + paddingTop + i * lineHeight + lineHeight / 2;
    ctx.fillText(line, canvas.width / 2, y);
  });
  return canvas.toDataURL("image/png");
}

/** Strips the `data:image/png;base64,` prefix for zip packing. */
export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
}
