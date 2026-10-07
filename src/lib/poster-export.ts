// Client-only export pipeline for the A4 posters.
//
// Each poster is rendered as a real DOM node at the exact A4 pixel size
// (794×1123 at 96 DPI). We snapshot the node with html-to-image at a
// higher pixel ratio, then drop the resulting image into a jsPDF A4 page.
// jspdf and html-to-image both import browser-only code, so this module
// must only be loaded inside event handlers (never at SSR/module scope).

import { POSTER_HEIGHT_PX, POSTER_WIDTH_PX } from "@/components/posters/poster-frame";

const A4_MM = { width: 210, height: 297 } as const;
const EXPORT_PIXEL_RATIO = 2.5;
/** A single poster that takes longer than this is treated as stuck. */
const POSTER_TIMEOUT_MS = 90_000;

function captureOptions(fontEmbedCSS?: string) {
  return {
    pixelRatio: EXPORT_PIXEL_RATIO,
    cacheBust: true,
    skipFonts: false,
    backgroundColor: "#ffffff",
    width: POSTER_WIDTH_PX,
    height: POSTER_HEIGHT_PX,
    ...(fontEmbedCSS !== undefined ? { fontEmbedCSS } : {}),
    style: {
      // The capture node may be inside a transformed preview wrapper. Reset
      // transforms during capture so html-to-image grabs the raw 794×1123 px.
      transform: "none",
      transformOrigin: "top left",
    },
  };
}

async function snapshotToPng(node: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  return toPng(node, captureOptions());
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      POSTER_TIMEOUT_MS,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Let the browser repaint (progress text) between heavy pages. */
const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

async function newDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
}

/** Export a single poster node to a one-page A4 PDF and trigger download. */
export async function exportPosterNodeToPdf(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  const png = await snapshotToPng(node);
  const doc = await newDoc();
  doc.addImage(png, "PNG", 0, 0, A4_MM.width, A4_MM.height, undefined, "FAST");
  doc.save(filename);
}

/**
 * Export several poster nodes to a single multi-page A4 PDF.
 * Pages are emitted in the order provided. Pass exactly the nodes you want
 * captured (skip ones missing required data — e.g. venues without QRs).
 *
 * Bulk pages are embedded as high-quality JPEGs and share one font
 * download: re-encoding a dozen+ large PNGs inside jsPDF can freeze the
 * tab for minutes, which looked like the download never finishing.
 */
export async function exportPosterNodesToPdf(
  nodes: HTMLElement[],
  filename: string,
  options: {
    printSafeBorder?: boolean;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<void> {
  if (nodes.length === 0) return;
  const { toJpeg, getFontEmbedCSS } = await import("html-to-image");
  const doc = await newDoc();
  // Fit the entire design inside a 5 mm safe edge without stretching it.
  // A4's aspect ratio means the centred top/bottom edge is slightly larger.
  const margin = options.printSafeBorder ? 5 : 0;
  const scale = Math.min(
    (A4_MM.width - margin * 2) / A4_MM.width,
    (A4_MM.height - margin * 2) / A4_MM.height,
  );
  const width = A4_MM.width * scale;
  const height = A4_MM.height * scale;
  const x = (A4_MM.width - width) / 2;
  const y = (A4_MM.height - height) / 2;

  let fontEmbedCSS: string | undefined;
  try {
    fontEmbedCSS = await withTimeout(getFontEmbedCSS(nodes[0]), "Font loading");
  } catch {
    fontEmbedCSS = undefined; // fall back to per-poster font embedding
  }

  options.onProgress?.(0, nodes.length);
  for (const [i, node] of nodes.entries()) {
    await yieldToBrowser();
    const jpeg = await withTimeout(
      toJpeg(node, { ...captureOptions(fontEmbedCSS), quality: 0.95 }),
      `Poster ${i + 1}`,
    );
    if (i > 0) doc.addPage("a4", "portrait");
    doc.addImage(jpeg, "JPEG", x, y, width, height, undefined, "FAST");
    options.onProgress?.(i + 1, nodes.length);
  }
  await yieldToBrowser();
  doc.save(filename);
}
