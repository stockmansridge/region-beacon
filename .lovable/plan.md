## Bake the QR caption into the downloaded image

Right now the `caption` prop on `QrPreview` renders as HTML text below the `<img>` on the page. It is not part of the PNG file, so when an organiser downloads the QR and prints/shares it, the name is missing.

Change: composite the QR + caption into a single PNG on a canvas, use that composite as both the on-page preview and the downloaded file. Remove the separate HTML caption line so we don't render the name twice.

### Files

**`src/components/qr-preview.tsx`**

In the existing client-only effect (after `QRCode.toDataURL(...)`):

1. Create an offscreen `<canvas>` sized at the QR render resolution (`size * 4` wide) with extra height for a caption band when `caption` is set — roughly `size * 4 + captionBandHeight` (e.g. +80px at 4x scale, tuned so the label reads clearly at the on-screen `size` too).
2. Fill the canvas white.
3. Draw the QR data URL (loaded into an `Image`) at the top.
4. If `caption` is provided:
   - `ctx.fillStyle = "#000"`
   - `ctx.font` = bold Arial at a size proportional to the QR (e.g. `${Math.round(size * 4 * 0.06)}px Arial, sans-serif`)
   - `ctx.textAlign = "center"`, `textBaseline = "middle"`
   - Wrap the caption to fit the canvas width (simple word-wrap, max 2 lines, ellipsis on overflow) so long venue names don't clip.
   - Draw centered in the caption band.
5. `canvas.toDataURL("image/png")` becomes the new `dataUrl` stored in state — this is what the `<img>` displays and what `downloadPng` saves. The file is now self-contained: QR + Arial name.
6. Remove the JSX block that renders `caption` as separate HTML text below the `<img>` (added in the previous change), so the name isn't duplicated.

Keep the existing:
- `awardsCaption` chip (that's a separate UI hint, not part of the printable QR).
- `poster.venueName` metadata block (drives the A4 poster PDF, unrelated).
- Poster PDF generation path unchanged — `generateQrPosterPdf` already composes its own layout from `checkinUrl`.

### Call sites

No changes — `caption` is already passed from the four sites (venue QR, bonus codes, tasting QR, event QR in Public Address). They now automatically get the baked-in label.

### Verification

- Typecheck passes.
- Each single QR preview on screen shows the QR with the name in Arial directly under it, as one image.
- Clicking "Download QR PNG" saves a PNG that includes the Arial name beneath the QR.
- Long names wrap to 2 lines and don't overflow the canvas.
- A4 poster PDF output is unchanged.
