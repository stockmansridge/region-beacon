import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";

describe("QR camera decoder", () => {
  it.each([false, true])("decodes a bonus QR image (inverted: %s)", (inverted) => {
    const payload = "https://orangewinequest.getstampd.com.au/collect/bonus/bonus_123";
    const qr = QRCode.create(payload);
    const scale = 8;
    const margin = 4;
    const width = (qr.modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const row = Math.floor(y / scale) - margin;
        const col = Math.floor(x / scale) - margin;
        const dark = row >= 0 && col >= 0 && row < qr.modules.size && col < qr.modules.size && qr.modules.get(row, col);
        const value = (Boolean(dark) !== inverted) ? 0 : 255;
        const index = (y * width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
        pixels[index + 3] = 255;
      }
    }
    expect(jsQR(pixels, width, width, { inversionAttempts: "attemptBoth" })?.data).toBe(payload);
  });
});