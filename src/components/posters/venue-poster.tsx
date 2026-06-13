import { PosterFrame, POSTER_WIDTH_PX, POSTER_HEIGHT_PX } from "./poster-frame";
import { PosterQr } from "./poster-qr";
import type { VenuePosterData } from "@/lib/poster-types";

type Props = {
  data: VenuePosterData;
  capture?: boolean;
  previewScale?: number;
  id?: string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function softColor(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readableOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

export function VenuePoster({ data, capture = false, previewScale, id }: Props) {
  const { branding } = data;
  const heroBg = data.venueImageUrl ?? branding.heroImageUrl;
  const pointsCopy =
    data.pointsValue && data.pointsValue > 0
      ? `${data.pointsValue} point${data.pointsValue === 1 ? "" : "s"}`
      : null;
  const stampsCopy = `${data.stampValue} stamp${data.stampValue === 1 ? "" : "s"} per scan`;

  const HERO_HEIGHT = Math.round(POSTER_HEIGHT_PX * 0.42); // ~42% of A4
  const primaryFg = readableOn(branding.primaryColor);
  const accentFg = readableOn(branding.accentColor);

  return (
    <PosterFrame
      id={id}
      capture={capture}
      previewScale={previewScale}
      background={branding.pageBackground}
      color={branding.textColor}
      fontFamily={branding.bodyFontFamily}
    >
      {/* FULL-BLEED HERO */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: HERO_HEIGHT,
          background: heroBg
            ? `url("${heroBg}") center/cover no-repeat`
            : `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%)`,
          overflow: "hidden",
        }}
      >
        {/* Dark gradient overlay for legibility */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, ${softColor(
              branding.primaryColor,
              0.25,
            )} 0%, rgba(0,0,0,0.15) 45%, ${softColor(branding.primaryColor, 0.85)} 100%)`,
          }}
        />
        {/* Hero text */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 88,
            color: "#ffffff",
          }}
        >
          <div
            style={{
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              fontWeight: 700,
              opacity: 0.92,
              textShadow: "0 1px 8px rgba(0,0,0,0.45)",
              marginBottom: 12,
            }}
          >
            Part of {data.eventName}
          </div>
          <div
            style={{
              fontFamily:
                branding.headingFontFamily ?? branding.bodyFontFamily ?? undefined,
              fontSize: 72,
              fontWeight: 900,
              lineHeight: 1.0,
              letterSpacing: "-0.015em",
              textShadow: "0 2px 18px rgba(0,0,0,0.45)",
            }}
          >
            {data.venueName}
          </div>
        </div>
        {/* CTA badge removed — QR card below is the primary CTA */}
      </div>

      {/* QR ACTION CARD — overlaps hero */}
      <div
        style={{
          position: "absolute",
          top: HERO_HEIGHT - 60,
          left: 48,
          right: 48,
          background: "#ffffff",
          borderRadius: 22,
          boxShadow: "0 18px 40px -18px rgba(15,23,42,0.35)",
          border: `1px solid ${softColor(branding.primaryColor, 0.15)}`,
          padding: "26px 28px",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          alignItems: "center",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: 10,
            borderRadius: 16,
            border: `2px solid ${branding.primaryColor}`,
          }}
        >
          <PosterQr value={data.venueQrUrl} size={200} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              fontWeight: 800,
              color: branding.primaryColor,
            }}
          >
            Scan to check in
          </div>
          <div
            style={{
              fontFamily: branding.headingFontFamily ?? undefined,
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1.1,
              color: branding.textColor,
              letterSpacing: "-0.01em",
            }}
          >
            Earn your stamp instantly
          </div>
          <div
            style={{ fontSize: 14, color: branding.mutedTextColor, lineHeight: 1.4 }}
          >
            Open your phone camera and point it at the code.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <Pill text={stampsCopy} bg={branding.primaryColor} fg={primaryFg} />
            {pointsCopy && (
              <Pill text={pointsCopy} bg={branding.accentColor} fg={accentFg} />
            )}
          </div>
        </div>
      </div>

      {/* DETAIL ZONE below QR */}
      <div
        style={{
          position: "absolute",
          top: HERO_HEIGHT + 240,
          left: 48,
          right: 48,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Offer module (only if present) */}
        {data.venueOffer && (
          <div
            style={{
              background: `linear-gradient(135deg, ${branding.accentColor} 0%, ${softColor(branding.accentColor, 0.85)} 100%)`,
              color: accentFg,
              borderRadius: 18,
              padding: "20px 22px",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 18,
              alignItems: "center",
              boxShadow: `0 12px 30px -16px ${softColor(branding.accentColor, 0.7)}`,
            }}
          >
            <IconCircle bg="rgba(255,255,255,0.22)" fg={accentFg}>
              <TagIcon />
            </IconCircle>
            <div>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  fontWeight: 800,
                  opacity: 0.85,
                  marginBottom: 4,
                }}
              >
                Offer available
              </div>
              <div
                style={{
                  fontFamily: branding.headingFontFamily ?? undefined,
                  fontSize: 22,
                  fontWeight: 800,
                  lineHeight: 1.2,
                  marginBottom: 4,
                }}
              >
                {truncate(data.venueOffer, 90)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                Show this poster or your passport at the counter to redeem.
              </div>
            </div>
          </div>
        )}

        {/* Two info cards row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <InfoCard
            bg={softColor(branding.primaryColor, 0.08)}
            iconBg={branding.primaryColor}
            iconFg={primaryFg}
            icon={<StarIcon />}
            label="Reward"
            value={pointsCopy ? `${pointsCopy} + stamp` : "1 stamp per check-in"}
            textColor={branding.textColor}
            mutedColor={branding.mutedTextColor}
            headingFont={branding.headingFontFamily}
          />
          <InfoCard
            bg={softColor(branding.accentColor, 0.1)}
            iconBg={branding.accentColor}
            iconFg={accentFg}
            icon={<PinIcon />}
            label="Find us"
            value={
              data.venueAddress ? truncate(data.venueAddress, 60) : data.venueName
            }
            textColor={branding.textColor}
            mutedColor={branding.mutedTextColor}
            headingFont={branding.headingFontFamily}
          />
        </div>

        {/* How it works strip */}
        <div
          style={{
            background: softColor(branding.primaryColor, 0.06),
            borderRadius: 16,
            padding: "16px 18px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <Step
            n={1}
            label="Scan"
            sub="the venue QR"
            color={branding.primaryColor}
            fg={primaryFg}
            text={branding.textColor}
            muted={branding.mutedTextColor}
          />
          <Step
            n={2}
            label="Collect"
            sub="stamps & points"
            color={branding.primaryColor}
            fg={primaryFg}
            text={branding.textColor}
            muted={branding.mutedTextColor}
          />
          <Step
            n={3}
            label="Unlock"
            sub="rewards & prizes"
            color={branding.primaryColor}
            fg={primaryFg}
            text={branding.textColor}
            muted={branding.mutedTextColor}
          />
        </div>
      </div>

      {/* Slim footer */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "14px 48px",
          background: branding.primaryColor,
          color: primaryFg,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: branding.headingFontFamily ?? undefined,
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          Explore. Collect. Get rewarded.
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.85,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace',
            textAlign: "right",
            maxWidth: "55%",
            wordBreak: "break-all",
            lineHeight: 1.3,
          }}
        >
          {data.publicUrl ?? "getstampd.com.au"}
          <div style={{ fontFamily: "inherit", opacity: 0.7, marginTop: 2 }}>
            Powered by GetStampd
          </div>
        </div>
      </div>

      {/* invisible spacer to silence unused width var */}
      <span style={{ display: "none" }}>{POSTER_WIDTH_PX}</span>
    </PosterFrame>
  );
}

/* ---------------- helpers ---------------- */

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color: fg,
        padding: "7px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: "0.02em",
      }}
    >
      {text}
    </span>
  );
}

function IconCircle({
  bg,
  fg,
  children,
  size = 56,
}: {
  bg: string;
  fg: string;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function InfoCard({
  bg,
  iconBg,
  iconFg,
  icon,
  label,
  value,
  textColor,
  mutedColor,
  headingFont,
}: {
  bg: string;
  iconBg: string;
  iconFg: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  textColor: string;
  mutedColor: string;
  headingFont: string | null;
}) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: 16,
        padding: "16px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <IconCircle bg={iconBg} fg={iconFg} size={48}>
        {icon}
      </IconCircle>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontWeight: 800,
            color: mutedColor,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: headingFont ?? undefined,
            fontSize: 15,
            fontWeight: 700,
            color: textColor,
            lineHeight: 1.25,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  label,
  sub,
  color,
  fg,
  text,
  muted,
}: {
  n: number;
  label: string;
  sub: string;
  color: string;
  fg: string;
  text: string;
  muted: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: color,
          color: fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: text, lineHeight: 1.1 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: muted, lineHeight: 1.2 }}>{sub}</div>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/* Inline SVG icons — avoid lucide to keep html-to-image fully self-contained. */

function TagIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
