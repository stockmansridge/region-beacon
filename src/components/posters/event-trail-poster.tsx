import { PosterFrame } from "./poster-frame";
import { PosterQr } from "./poster-qr";
import type { EventPosterData } from "@/lib/poster-types";

type Props = {
  data: EventPosterData;
  capture?: boolean;
  previewScale?: number;
  id?: string;
};

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

function softColor(hex: string, alpha: number): string {
  // Render a translucent overlay using rgba derived from the hex value.
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function EventTrailPoster({ data, capture = false, previewScale, id }: Props) {
  const { branding } = data;
  const dateText = formatDateRange(data.startDate, data.endDate, data.timezone);

  return (
    <PosterFrame
      id={id}
      capture={capture}
      previewScale={previewScale}
      background={branding.pageBackground}
      color={branding.textColor}
      fontFamily={branding.bodyFontFamily}
    >
      {/* Header band */}
      <div
        style={{
          height: 16,
          background: branding.primaryColor,
        }}
      />
      <div
        style={{
          height: 6,
          background: branding.accentColor,
        }}
      />

      {/* Hero */}
      <div
        style={{
          position: "relative",
          margin: "32px 48px 0",
          height: 280,
          borderRadius: 18,
          overflow: "hidden",
          background: branding.heroImageUrl
            ? `linear-gradient(180deg, ${softColor(branding.primaryColor, 0.05)} 0%, ${softColor(branding.primaryColor, 0.55)} 100%), url("${branding.heroImageUrl}") center/cover no-repeat`
            : `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%)`,
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 32,
          boxSizing: "border-box",
        }}
      >
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              top: 24,
              left: 24,
              maxWidth: 120,
              maxHeight: 56,
              objectFit: "contain",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
            }}
          />
        )}
        <div
          style={{
            fontFamily: branding.headingFontFamily ?? branding.bodyFontFamily ?? undefined,
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            textShadow: "0 2px 12px rgba(0,0,0,0.35)",
          }}
        >
          {data.eventName}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 18,
            fontWeight: 500,
            opacity: 0.95,
            textShadow: "0 1px 6px rgba(0,0,0,0.35)",
          }}
        >
          Explore. Collect stamps. Get rewarded.
        </div>
      </div>

      {/* Info row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          margin: "28px 48px 0",
        }}
      >
        <InfoTile
          label="Dates"
          value={dateText ?? "TBA"}
          color={branding.primaryColor}
          card={branding.cardBackground}
          text={branding.textColor}
          muted={branding.mutedTextColor}
        />
        <InfoTile
          label="Venues"
          value={`${data.venueCount} participating`}
          color={branding.primaryColor}
          card={branding.cardBackground}
          text={branding.textColor}
          muted={branding.mutedTextColor}
        />
        <InfoTile
          label="Location"
          value={data.eventLocation ?? "—"}
          color={branding.primaryColor}
          card={branding.cardBackground}
          text={branding.textColor}
          muted={branding.mutedTextColor}
        />
      </div>

      {/* Description / rewards */}
      <div style={{ margin: "20px 48px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {data.eventDescription && (
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.55,
              color: branding.textColor,
            }}
          >
            {truncate(data.eventDescription, 240)}
          </p>
        )}
        {data.rewardSummary && (
          <div
            style={{
              background: softColor(branding.accentColor, 0.12),
              border: `1px solid ${softColor(branding.accentColor, 0.4)}`,
              color: branding.textColor,
              borderRadius: 14,
              padding: "14px 18px",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
                color: branding.accentColor,
                marginBottom: 4,
              }}
            >
              Rewards
            </div>
            {truncate(data.rewardSummary, 220)}
          </div>
        )}
      </div>

      {/* QR block */}
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 76,
          background: branding.cardBackground,
          border: `1px solid ${softColor(branding.primaryColor, 0.2)}`,
          borderRadius: 18,
          padding: "22px 28px",
          display: "flex",
          alignItems: "center",
          gap: 24,
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
          <PosterQr value={data.eventQrUrl} size={180} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: branding.headingFontFamily ?? undefined,
              fontSize: 28,
              fontWeight: 800,
              color: branding.primaryColor,
              lineHeight: 1.15,
              marginBottom: 6,
            }}
          >
            Scan to join the trail
          </div>
          <div style={{ fontSize: 14, color: branding.mutedTextColor, marginBottom: 10 }}>
            No app download required. Open your camera and scan.
          </div>
          {data.publicUrl && (
            <div
              style={{
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

      {/* Footer */}
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

function InfoTile({
  label,
  value,
  color,
  card,
  text,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  card: string;
  text: string;
  muted: string;
}) {
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${softColor(color, 0.18)}`,
        borderRadius: 14,
        padding: "14px 16px",
        minHeight: 78,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
          color: color,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: text, lineHeight: 1.3 }}>{value}</div>
      <div style={{ display: "none", color: muted }} />
    </div>
  );
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
