// Client-only export pipeline for the A4 posters.
//
// Each poster is rendered as a real DOM node at the exact A4 pixel size
// (794×1123 at 96 DPI). We snapshot the node with html-to-image at a
// higher pixel ratio, then drop the resulting PNG into a jsPDF A4 page.
// jspdf and html-to-image both import browser-only code, so this module
// must only be loaded inside event handlers (never at SSR/module scope).

import { POSTER_HEIGHT_PX, POSTER_WIDTH_PX } from "@/components/posters/poster-frame";

const A4_MM = { width: 210, height: 297 } as const;
const EXPORT_PIXEL_RATIO = 2.5;

async function snapshotToPng(node: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  // cacheBust=true avoids stale image responses when the user re-exports
  // after swapping a cover image; skipFonts avoids cross-origin font
  // fetches that occasionally break the snapshot when Google Fonts is
  // throttled.
  return toPng(node, {
    pixelRatio: EXPORT_PIXEL_RATIO,
    cacheBust: true,
    skipFonts: false,
    backgroundColor: "#ffffff",
    width: POSTER_WIDTH_PX,
    height: POSTER_HEIGHT_PX,
    style: {
      // The capture node may be inside a transformed preview wrapper. Reset
      // transforms during capture so html-to-image grabs the raw 794×1123 px.
      transform: "none",
      transformOrigin: "top left",
    },
  });
}

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
 */
export async function exportPosterNodesToPdf(
  nodes: HTMLElement[],
  filename: string,
): Promise<void> {
  if (nodes.length === 0) return;
  const doc = await newDoc();
  for (let i = 0; i < nodes.length; i++) {
    const png = await snapshotToPng(nodes[i]!);
    if (i > 0) doc.addPage("a4", "portrait");
    doc.addImage(png, "PNG", 0, 0, A4_MM.width, A4_MM.height, undefined, "FAST");
  }
  doc.save(filename);
}
