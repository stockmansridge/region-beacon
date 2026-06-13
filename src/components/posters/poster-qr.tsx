import { useEffect, useState } from "react";

type Props = {
  value: string | null;
  /** Rendered pixel size of the QR (square). */
  size: number;
  /** Foreground colour. Defaults to black for max scanability. */
  dark?: string;
  /** Background colour behind the QR pixels. */
  light?: string;
};

/**
 * Renders a QR code as an inline data-URL <img>. The qrcode package
 * pulls in node:fs at module scope, so it must be lazy-imported and
 * never executed during SSR.
 */
export function PosterQr({ value, size, dark = "#000000", light = "#ffffff" }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    if (!value) return;
    if (typeof window === "undefined") return;
    (async () => {
      try {
        const mod = (await import("qrcode")) as unknown as {
          default?: typeof import("qrcode");
        } & typeof import("qrcode");
        const QRCode = mod.default ?? mod;
        const url = await QRCode.toDataURL(value, {
          errorCorrectionLevel: "H",
          margin: 1,
          // Render at high resolution so the printed PDF is crisp even
          // when scaled up by the export pipeline.
          width: Math.max(size * 4, 1024),
          color: { dark, light },
        });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size, dark, light]);

  const box = {
    width: size,
    height: size,
    background: light,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  } as const;

  if (!value) {
    return (
      <div style={{ ...box, color: "#94a3b8", fontSize: 12, padding: 12, textAlign: "center" }}>
        No QR available
      </div>
    );
  }
  if (failed) {
    return (
      <div style={{ ...box, color: "#dc2626", fontSize: 12, padding: 12, textAlign: "center" }}>
        QR render failed
      </div>
    );
  }
  if (!dataUrl) {
    return <div style={box} aria-label="Generating QR code" />;
  }
  return (
    <img
      src={dataUrl}
      alt=""
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size }}
    />
  );
}
