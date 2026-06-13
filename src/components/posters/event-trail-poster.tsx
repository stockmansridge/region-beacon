import { PosterFrame, POSTER_HEIGHT_PX, POSTER_WIDTH_PX } from "./poster-frame";
import { PosterQr } from "./poster-qr";
import type { EventPosterData } from "@/lib/poster-types";

type Props = {
  data: EventPosterData;
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

function formatDateRange(
  startsAt: string | null,
  endsAt: string | null,
  timezone: string | null,
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

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function EventTrailPoster({ data, capture = false, previewScale, id }: Props) {
  const { branding } = data;
  const dateText = formatDateRange(data.startDate, data.endDate, data.timezone);

  const HERO_HEIGHT = Math.round(POSTER_HEIGHT_PX * 0.46); // ~46% of A4
  const primaryFg = readableOn(branding.primaryColor);
  const accentFg = readableOn(branding.accentColor);
  const heroBg = branding.heroImageUrl;

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
              0.30,
            )} 0%, rgba(0,0,0,0.20) 40%, ${softColor(branding.primaryColor, 0.88)} 100%)`,
          }}
        />
        {/* Logo */}
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              top: 36,
              left: 56,
              maxWidth: 160,
              maxHeight: 72,
              objectFit: "contain",
              filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.4))",
            }}
          />
        )}
        {/* Hero text block */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 96,
            color: "#ffffff",
          }}
        >
          <div
            style={{
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.28em",
              fontWeight: 700,
              opacity: 0.95,
              textShadow: "0 1px 8px rgba(0,0,0,0.5)",
              marginBottom: 14,
            }}
          >
            Welcome to
          </div>
          <div
            style={{
              fontFamily:
                branding.headingFontFamily ?? branding.bodyFontFamily ?? undefined,
              fontSize: 78,
              fontWeight: 900,
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
              textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            }}
          >
            {data.eventName}
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 20,
              fontWeight: 600,
              opacity: 0.95,
              textShadow: "0 1px 8px rgba(0,0,0,0.45)",
              maxWidth: 540,
            }}
          >
            Explore. Collect stamps. Get rewarded.
          </div>
        </div>
        {/* CTA badge on hero bottom edge */}
        <div
          style={{
            position: "absolute",
            left: 56,
            bottom: 36,
            background: branding.accentColor,
            color: accentFg,
            padding: "13px 22px",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
          }}
        >
          ★ Scan · Visit · Collect · Win
        </div>
      </div>

      {/* QR ACTION CARD — overlaps hero */}
      <div
        style={{
          position: "absolute",
          top: HERO_HEIGHT - 64,
          left: 48,
          right: 48,
          background: "#ffffff",
          borderRadius: 22,
          boxShadow: "0 18px 44px -18px rgba(15,23,42,0.38)",
          border: `1px solid ${softColor(branding.primaryColor, 0.18)}`,
          padding: "28px 30px",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 26,
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
          <PosterQr value={data.eventQrUrl} size={210} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              fontWeight: 800,
              color: branding.primaryColor,
            }}
          >
            Scan to join the trail
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
            Start your passport
          </div>
          <div
            style={{ fontSize: 14, color: branding.mutedTextColor, lineHeight: 1.45 }}
          >
            Open your phone camera. Visit participating venues, collect stamps, and
            unlock rewards.
          </div>
          {data.publicUrl && (
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: branding.textColor,
                wordBreak: "break-all",
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace',
              }}
            >
              {data.publicUrl}
            </div>
          )}
        </div>
      </div>

      {/* DETAIL ZONE */}
      <div
        style={{
          position: "absolute",
          top: HERO_HEIGHT + 220,
          left: 48,
          right: 48,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Rewards module (only if present) */}
        {data.rewardSummary && (
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
              <GiftIcon />
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
                Rewards to unlock
              </div>
              <div
                style={{
                  fontFamily: branding.headingFontFamily ?? undefined,
                  fontSize: 20,
                  fontWeight: 800,
                  lineHeight: 1.25,
                }}
              >
                {truncate(data.rewardSummary, 130)}
              </div>
            </div>
          </div>
        )}

        {/* Info cards — 2 columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <InfoCard
            bg={softColor(branding.primaryColor, 0.08)}
            iconBg={branding.primaryColor}
            iconFg={primaryFg}
            icon={<CalendarIcon />}
            label="Dates"
            value={dateText ?? "Available now"}
            textColor={branding.textColor}
            mutedColor={branding.mutedTextColor}
            headingFont={branding.headingFontFamily}
          />
          <InfoCard
            bg={softColor(branding.accentColor, 0.1)}
            iconBg={branding.accentColor}
            iconFg={accentFg}
            icon={<StoreIcon />}
            label="Venues"
            value={`${data.venueCount} participating`}
            textColor={branding.textColor}
            mutedColor={branding.mutedTextColor}
            headingFont={branding.headingFontFamily}
          />
          {data.eventLocation && (
            <InfoCard
              bg={softColor(branding.primaryColor, 0.08)}
              iconBg={branding.primaryColor}
              iconFg={primaryFg}
              icon={<PinIcon />}
              label="Location"
              value={truncate(data.eventLocation, 60)}
              textColor={branding.textColor}
              mutedColor={branding.mutedTextColor}
              headingFont={branding.headingFontFamily}
            />
          )}
          {!data.rewardSummary && (
            <InfoCard
              bg={softColor(branding.accentColor, 0.1)}
              iconBg={branding.accentColor}
              iconFg={accentFg}
              icon={<TrophyIcon />}
              label="Rewards"
              value="Collect stamps & unlock rewards"
              textColor={branding.textColor}
              mutedColor={branding.mutedTextColor}
              headingFont={branding.headingFontFamily}
            />
          )}
        </div>

        {/* How it works strip — 4 steps */}
        <div
          style={{
            background: softColor(branding.primaryColor, 0.06),
            borderRadius: 16,
            padding: "16px 18px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 10,
          }}
        >
          <Step
            n={1}
            label="Scan"
            sub="the trail QR"
            color={branding.primaryColor}
            fg={primaryFg}
            text={branding.textColor}
            muted={branding.mutedTextColor}
          />
          <Step
            n={2}
            label="Visit"
            sub="venues"
            color={branding.primaryColor}
            fg={primaryFg}
            text={branding.textColor}
            muted={branding.mutedTextColor}
          />
          <Step
            n={3}
            label="Collect"
            sub="stamps"
            color={branding.primaryColor}
            fg={primaryFg}
            text={branding.textColor}
            muted={branding.mutedTextColor}
          />
          <Step
            n={4}
            label="Get rewarded"
            sub="unlock prizes"
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
            opacity: 0.9,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace',
            textAlign: "right",
            maxWidth: "55%",
            wordBreak: "break-all",
            lineHeight: 1.3,
          }}
        >
          {data.publicUrl ?? "getstampd.com.au"}
          <div style={{ fontFamily: "inherit", opacity: 0.75, marginTop: 2 }}>
            Powered by GetStampd
          </div>
        </div>
      </div>

      <span style={{ display: "none" }}>{POSTER_WIDTH_PX}</span>
    </PosterFrame>
  );
}

/* ---------------- helpers ---------------- */

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

/* Inline SVG icons — keep html-to-image self-contained. */

function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
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

function GiftIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v9h14v-9" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8S14 3 16.5 3a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v3a3 3 0 0 1-3 3M7 5H4v3a3 3 0 0 0 3 3" />
    </svg>
  );
}
