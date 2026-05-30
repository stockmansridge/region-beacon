import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type PosterInput = {
  eventName: string;
  venueName: string;
  checkinUrl: string;
  /** Public HTTPS URL for the event logo (optional). */
  logoUrl?: string | null;
  /** CSS hex colour (e.g. "#1f2937"). Falls back to a neutral dark. */
  primaryColor?: string | null;
  /** CSS hex colour. Falls back to primary. */
  accentColor?: string | null;
  /** Short descriptor shown under the QR (venues.offer_summary). */
  offerSummary?: string | null;
  /** Entries earned per scan. When > 1 a bonus line is shown. */
  entryValue?: number | null;
};

/**
 * Slug helper used for filenames. Matches the QR PNG filename convention.
 */
export function slugForFilename(value: string, fallback: string): string {
  const s = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

export function posterFilename(eventSlug: string, venueName: string): string {
  const e = slugForFilename(eventSlug, "event");
  const v = slugForFilename(venueName, "venue");
  return `getstampd-${e}-${v}-poster.pdf`;
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

/**
 * Fetch an image URL and return a data URL plus inferred format. Uses fetch +
 * FileReader so it works for both Supabase Storage public URLs and any other
 * CORS-friendly image. Returns null on failure so callers can degrade.
 */
async function imageToDataUrl(
  url: string,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
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
    const isJpeg = /image\/jpe?g/i.test(blob.type);
    return { dataUrl, format: isJpeg ? "JPEG" : "PNG" };
  } catch {
    return null;
  }
}

/**
 * Generate an A4 portrait poster PDF entirely client-side and trigger a
 * browser download. Nothing is uploaded or stored.
 */
export async function generateQrPosterPdf(
  input: PosterInput,
  filename: string,
): Promise<void> {
  const primary = normaliseHex(input.primaryColor, "#111827");
  const accent = normaliseHex(input.accentColor, primary);

  // A4 portrait in millimetres
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297

  // Top accent band
  doc.setFillColor(primary);
  doc.rect(0, 0, pageW, 14, "F");
  doc.setFillColor(accent);
  doc.rect(0, 14, pageW, 2, "F");

  let cursorY = 28;

  // Optional event logo, centred near the top
  if (input.logoUrl) {
    const img = await imageToDataUrl(input.logoUrl);
    if (img) {
      const maxW = 60;
      const maxH = 24;
      // jsPDF can't measure intrinsic ratio without a probe; fit within box
      // by drawing into a constrained area — jsPDF preserves the embedded
      // image's own aspect when both w and h are provided to fit-box style
      // calls, so we approximate by using a square bounding box.
      const size = Math.min(maxW, maxH);
      const x = (pageW - size) / 2;
      try {
        doc.addImage(img.dataUrl, img.format, x, cursorY, size, size, undefined, "FAST");
        cursorY += size + 6;
      } catch {
        // ignore broken image, fall through to text-only header
      }
    }
  }

  // Event name
  doc.setTextColor(primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const eventLines = doc.splitTextToSize(input.eventName, pageW - 30);
  doc.text(eventLines, pageW / 2, cursorY, { align: "center" });
  cursorY += 8 * eventLines.length;

  // Venue name
  doc.setTextColor("#111111");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  const venueLines = doc.splitTextToSize(input.venueName, pageW - 30);
  cursorY += 4;
  doc.text(venueLines, pageW / 2, cursorY, { align: "center" });
  cursorY += 12 * venueLines.length;

  // Instruction
  doc.setTextColor("#222222");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.text("Scan to collect your stamp", pageW / 2, cursorY, { align: "center" });
  cursorY += 8;

  doc.setTextColor("#555555");
  doc.setFontSize(11);
  doc.text("No app download required", pageW / 2, cursorY, { align: "center" });
  cursorY += 10;

  // QR code — render large and centred. Use high error correction so a
  // printed poster tolerates smudges and partial damage.
  const qrDataUrl = await QRCode.toDataURL(input.checkinUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 1024,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrSize = 110; // mm — easily phone-scannable from ~1m away
  const qrX = (pageW - qrSize) / 2;
  const qrY = Math.max(cursorY, 120);
  // White card behind QR for contrast on coloured backgrounds (future-proof)
  doc.setFillColor("#ffffff");
  doc.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, "F");
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");

  // Descriptor / offer summary under the QR (optional, truncated safely)
  let belowQrY = qrY + qrSize + 8;
  const summary = (input.offerSummary ?? "").trim();
  if (summary) {
    const truncated = summary.length > 220 ? `${summary.slice(0, 217)}…` : summary;
    doc.setTextColor("#222222");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    const summaryLines = doc.splitTextToSize(truncated, pageW - 30);
    const maxLines = Math.min(summaryLines.length, 3);
    doc.text(summaryLines.slice(0, maxLines), pageW / 2, belowQrY, { align: "center" });
    belowQrY += 5.5 * maxLines + 2;
  }

  // Bonus entries line
  const entryValue = input.entryValue ?? 1;
  if (typeof entryValue === "number" && entryValue > 1) {
    doc.setTextColor(accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(
      `Bonus: this stamp is worth ${entryValue} entries`,
      pageW / 2,
      belowQrY + 2,
      { align: "center" },
    );
    belowQrY += 8;
  }

  // Check-in URL in small text under the QR
  doc.setTextColor("#333333");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const urlLines = doc.splitTextToSize(input.checkinUrl, pageW - 30);
  doc.text(urlLines, pageW / 2, belowQrY + 4, { align: "center" });

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
