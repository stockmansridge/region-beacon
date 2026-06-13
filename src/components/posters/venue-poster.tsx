import { PosterFrame } from "./poster-frame";
import { PosterQr } from "./poster-qr";
import type { VenuePosterData } from "@/lib/poster-types";

type Props = {
  data: VenuePosterData;
  capture?: boolean;
  previewScale?: number;
  id?: string;
};

function softColor(hex: string, alpha: number): string {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function VenuePoster({ data, capture = false, previewScale, id }: Props) {
  const { branding } = data;
  const heroBg = data.venueImageUrl ?? branding.heroImageUrl;
  const pointsCopy = data.pointsValue && data.pointsValue > 0
    ? `${data.pointsValue} point${data.pointsValue === 1 ? "" : "s"}`
    : null;
  const stampsCopy = `${data.stampValue} stamp${data.stampValue === 1 ? "" : "s"} per scan`;

  return (
    <PosterFrame
      id={id}
      capture={capture}
      previewScale={previewScale}
      background={branding.pageBackground}
      color={branding.textColor}
      fontFamily={branding.bodyFontFamily}
    >
      <div style={{ height: 14, background: branding.primaryColor }} />
      <div style={{ height: 4, background: branding.accentColor }} />

      {/* Top band: event + logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "28px 48px 0",
          minHeight: 56,
        }}
      >
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ maxWidth: 140, maxHeight: 56, objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: branding.primaryColor,
            }}
          >
            {data.eventName}
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontWeight: 700,
            color: branding.mutedTextColor,
          }}
        >
          Part of {data.eventName}
        </div>
      </div>

      {/* Hero / venue title */}
      <div
        style={{
          margin: "20px 48px 0",
          borderRadius: 20,
          overflow: "hidden",
          position: "relative",
          height: 240,
          background: heroBg
            ? `linear-gradient(180deg, ${softColor(branding.primaryColor, 0.1)} 0%, ${softColor(branding.primaryColor, 0.7)} 100%), url("${heroBg}") center/cover no-repeat`
            : `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%)`,
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 28,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontWeight: 700,
            opacity: 0.9,
            textShadow: "0 1px 6px rgba(0,0,0,0.35)",
          }}
        >
          Welcome to
        </div>
        <div
          style={{
            fontFamily: branding.headingFontFamily ?? branding.bodyFontFamily ?? undefined,
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            marginTop: 6,
            textShadow: "0 2px 12px rgba(0,0,0,0.35)",
          }}
        >
          {data.venueName}
        </div>
      </div>

      {/* CTA line */}
      <div
        style={{
          margin: "26px 48px 0",
          fontFamily: branding.headingFontFamily ?? undefined,
          fontSize: 28,
          fontWeight: 800,
          color: branding.primaryColor,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        Collect your stamp here
      </div>

      {/* QR + details */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          alignItems: "center",
          margin: "20px 48px 0",
          background: branding.cardBackground,
          border: `1px solid ${softColor(branding.primaryColor, 0.2)}`,
          borderRadius: 18,
          padding: "22px 24px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: 10,
            borderRadius: 14,
            border: `1px solid ${softColor(branding.primaryColor, 0.2)}`,
          }}
        >
          <PosterQr value={data.venueQrUrl} size={210} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: branding.textColor,
            }}
          >
            Scan to check in
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill text={stampsCopy} fg={branding.primaryColor} />
            {pointsCopy && <Pill text={pointsCopy} fg={branding.accentColor} />}
          </div>
          {data.venueOffer && (
            <div
              style={{
                background: softColor(branding.accentColor, 0.14),
                border: `1px solid ${softColor(branding.accentColor, 0.45)}`,
                borderRadius: 12,
                padding: "10px 14px",
                fontSize: 14,
                lineHeight: 1.45,
                color: branding.textColor,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 700,
                  color: branding.accentColor,
                  marginBottom: 2,
                }}
              >
                Special offer
              </div>
              {truncate(data.venueOffer, 180)}
            </div>
          )}
          {data.venueAddress && (
            <div style={{ fontSize: 13, color: branding.mutedTextColor, lineHeight: 1.4 }}>
              📍 {truncate(data.venueAddress, 140)}
            </div>
          )}
        </div>
      </div>

      {/* Footer tagline + URL */}
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 72,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: branding.headingFontFamily ?? undefined,
            fontSize: 18,
            fontWeight: 700,
            color: branding.textColor,
            marginBottom: 6,
          }}
        >
          Explore. Collect. Get rewarded.
        </div>
        {data.publicUrl && (
          <div
            style={{
              fontSize: 12,
              color: branding.mutedTextColor,
              wordBreak: "break-all",
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace',
            }}
          >
            {data.publicUrl}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 48,
          background: branding.primaryColor,
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          letterSpacing: "0.04em",
          fontSize: 14,
        }}
      >
        Powered by GetStampd
      </div>
    </PosterFrame>
  );
}

function Pill({ text, fg }: { text: string; fg: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(15,23,42,0.04)",
        border: `1px solid ${fg}`,
        color: fg,
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.01em",
      }}
    >
      {text}
    </span>
  );
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
