// Client-side generator for the printable Event Poster PDF.
//
// The poster QR links to the public event landing page (i.e. the event's
// public subdomain root). It does NOT embed venue QR check-in tokens, and
// nothing is uploaded or persisted — the PDF is built in the browser and
// saved via jsPDF.save().

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { slugForFilename } from "@/lib/qr-poster";

export type EventPosterInput = {
  eventName: string;
  publicUrl: string; // e.g. https://demo.getstamped.com.au
  description?: string | null;
  welcomeCopy?: string | null;
  startsAt?: string | null; // ISO
  endsAt?: string | null; // ISO
  timezone?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
};

export function eventPosterFilename(eventSlug: string | null | undefined): string {
  const e = slugForFilename(eventSlug ?? "", "event");
  return `getstampd-${e}-event-poster.pdf`;
}

function normaliseHex(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  const v = input.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) return v.startsWith("#") ? v : `#${v}`;
  if (/^#?[0-9a-fA-F]{3}$/.test(v)) {
    const t = v.replace("#", "");
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  }
  return fallback;
}

async function loadImage(
  url: string,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    const isJpeg = /image\/jpe?g/i.test(blob.type);
    return { dataUrl, format: isJpeg ? "JPEG" : "PNG", w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

function formatDateRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!startsAt && !endsAt) return null;
  const tz = timezone || undefined;
  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: tz,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toDateString();
    }
  };
  if (startsAt && endsAt) {
    const a = fmt(startsAt);
    const b = fmt(endsAt);
    return a === b ? a : `${a} – ${b}`;
  }
  return fmt((startsAt ?? endsAt) as string);
}

export async function generateEventPosterPdf(
  input: EventPosterInput,
  filename: string,
): Promise<void> {
  const primary = normaliseHex(input.primaryColor, "#111827");
  const accent = normaliseHex(input.accentColor, primary);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297

  // Top accent band
  doc.setFillColor(primary);
  doc.rect(0, 0, pageW, 16, "F");
  doc.setFillColor(accent);
  doc.rect(0, 16, pageW, 2, "F");

  let cursorY = 24;

  // Optional cover image as a wide hero band
  if (input.coverUrl) {
    const img = await loadImage(input.coverUrl);
    if (img) {
      const boxW = pageW - 24;
      const boxH = 55;
      const ratio = img.w / img.h;
      let drawW = boxW;
      let drawH = drawW / ratio;
      if (drawH > boxH) {
        drawH = boxH;
        drawW = drawH * ratio;
      }
      const x = (pageW - drawW) / 2;
      try {
        doc.addImage(img.dataUrl, img.format, x, cursorY, drawW, drawH, undefined, "FAST");
        cursorY += drawH + 6;
      } catch {
        // ignore
      }
    }
  }

  // Optional logo, centred
  if (input.logoUrl) {
    const img = await loadImage(input.logoUrl);
    if (img) {
      const maxW = 40;
      const maxH = 22;
      const ratio = img.w / img.h;
      let drawW = maxW;
      let drawH = drawW / ratio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * ratio;
      }
      const x = (pageW - drawW) / 2;
      try {
        doc.addImage(img.dataUrl, img.format, x, cursorY, drawW, drawH, undefined, "FAST");
        cursorY += drawH + 4;
      } catch {
        // ignore
      }
    }
  }

  // Event name
  doc.setTextColor(primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  const nameLines = doc.splitTextToSize(input.eventName, pageW - 30);
  doc.text(nameLines, pageW / 2, cursorY + 2, { align: "center" });
  cursorY += 9 * nameLines.length + 2;

  // Dates
  const dateText = formatDateRange(input.startsAt, input.endsAt, input.timezone);
  if (dateText) {
    doc.setTextColor("#374151");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(dateText, pageW / 2, cursorY, { align: "center" });
    cursorY += 7;
  }

  // Description / welcome copy
  const copy = (input.welcomeCopy ?? input.description ?? "").trim();
  if (copy) {
    doc.setTextColor("#444444");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const truncated = copy.length > 320 ? `${copy.slice(0, 317)}…` : copy;
    const copyLines = doc.splitTextToSize(truncated, pageW - 40);
    const maxLines = Math.min(copyLines.length, 4);
    doc.text(copyLines.slice(0, maxLines), pageW / 2, cursorY + 2, { align: "center" });
    cursorY += 5 * maxLines + 4;
  }

  // QR code
  const qrDataUrl = await QRCode.toDataURL(input.publicUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 1024,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrSize = 95;
  const qrX = (pageW - qrSize) / 2;
  const qrY = Math.max(cursorY + 4, pageH - 100 - qrSize);
  doc.setFillColor("#ffffff");
  doc.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, "F");
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");

  // Instruction
  let belowQr = qrY + qrSize + 8;
  doc.setTextColor("#111111");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Scan to start your passport", pageW / 2, belowQr, { align: "center" });
  belowQr += 7;

  doc.setTextColor("#555555");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("No app download required", pageW / 2, belowQr, { align: "center" });
  belowQr += 7;

  // Public URL
  doc.setTextColor("#333333");
  doc.setFontSize(9);
  const urlLines = doc.splitTextToSize(input.publicUrl, pageW - 30);
  doc.text(urlLines, pageW / 2, belowQr, { align: "center" });

  // Footer band
  const footerH = 14;
  doc.setFillColor(primary);
  doc.rect(0, pageH - footerH, pageW, footerH, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Powered by GetStampd", pageW / 2, pageH - footerH / 2 + 1.5, {
    align: "center",
  });

  doc.save(filename);
}
